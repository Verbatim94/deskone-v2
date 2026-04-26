import { withJsonHandler, HttpError, jsonResponse } from "../_shared/http.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { verifyPassword } from "../_shared/password.ts";
import { createRawSessionToken, getClientIp, getSessionExpiryDate, getUserAgent, hashSessionToken } from "../_shared/sessions.ts";
import { buildSessionView } from "../_shared/session-view.ts";
import { assertLoginRateLimit, clearLoginFailures, registerLoginFailure } from "../_shared/security.ts";
import { writeAuditEvent } from "../_shared/audit.ts";

Deno.serve((req) =>
  withJsonHandler(req, async () => {
    if (req.method !== "POST") {
      throw new HttpError(405, "bad_request", "Unsupported method.");
    }

    const body = (await req.json()) as { username?: string; password?: string };
    const username = body.username?.trim();
    const password = body.password ?? "";
    const clientIp = getClientIp(req);

    if (!username || !password) {
      throw new HttpError(400, "bad_request", "Username and password are required.");
    }

    if (username.length > 128 || password.length > 1024) {
      throw new HttpError(400, "bad_request", "Credential payload is too large.");
    }

    const supabase = createAdminClient();
    await assertLoginRateLimit(supabase, { username, clientIp });

    const { data: user, error } = await supabase
      .from("app_users")
      .select("id, username, full_name, role, password_hash, is_active, login_enabled, must_change_password, session_version")
      .eq("username", username)
      .single();

    if (error || !user || !user.is_active || !user.login_enabled) {
      await registerLoginFailure(supabase, { username, clientIp });
      await writeAuditEvent(supabase, {
        action: "auth.login.failed",
        entityType: "auth_login",
        ipAddress: clientIp,
        userAgent: getUserAgent(req),
        details: {
          username,
          reason: user && user.is_active && !user.login_enabled ? "login_disabled" : "invalid_credentials",
        },
      });
      throw new HttpError(401, "invalid_credentials", "Invalid credentials.");
    }

    const isValidPassword = await verifyPassword(password, user.password_hash as string);

    if (!isValidPassword) {
      await registerLoginFailure(supabase, { username, clientIp });
      await writeAuditEvent(supabase, {
        actorUserId: user.id as string,
        action: "auth.login.failed",
        entityType: "auth_login",
        entityId: user.id as string,
        ipAddress: clientIp,
        userAgent: getUserAgent(req),
        details: {
          username,
          reason: "invalid_credentials",
        },
      });
      throw new HttpError(401, "invalid_credentials", "Invalid credentials.");
    }

    await clearLoginFailures(supabase, { username, clientIp });

    const sessionToken = createRawSessionToken();
    const sessionTokenHash = await hashSessionToken(sessionToken);
    const expiresAt = getSessionExpiryDate();

    const { error: sessionInsertError } = await supabase.from("app_sessions").insert({
      user_id: user.id,
      session_token_hash: sessionTokenHash,
      session_version: user.session_version,
      expires_at: expiresAt.toISOString(),
      user_agent: getUserAgent(req),
      ip_address: clientIp,
    });

    if (sessionInsertError) {
      throw new HttpError(500, "internal_error", "Failed to create session.", sessionInsertError.message);
    }

    const { error: touchUserError } = await supabase
      .from("app_users")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", user.id);

    if (touchUserError) {
      console.error("Failed to update last login metadata", touchUserError);
    }

    const sessionView = await buildSessionView(supabase, {
      sessionId: "pending-bootstrap",
      userId: user.id as string,
      expiresAt: expiresAt.toISOString(),
      user: {
        id: user.id as string,
        username: user.username as string,
        fullName: user.full_name as string,
        role: user.role as "super_admin" | "admin" | "user",
        mustChangePassword: user.must_change_password as boolean,
      },
    });

    await writeAuditEvent(supabase, {
      actorUserId: user.id as string,
      action: "auth.login.succeeded",
      entityType: "app_session",
      ipAddress: clientIp,
      userAgent: getUserAgent(req),
      details: {
        sessionExpiry: expiresAt.toISOString(),
      },
    });

    return jsonResponse(req, {
      sessionToken,
      expiresAt: expiresAt.toISOString(),
      identityProviders: sessionView.identityProviders,
      user: sessionView.user,
      organizations: sessionView.organizations,
    });
  }),
);
