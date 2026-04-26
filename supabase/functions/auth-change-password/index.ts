import { writeAuditEvent } from "../_shared/audit.ts";
import { withJsonHandler, HttpError, jsonResponse } from "../_shared/http.ts";
import { createPasswordHash, validatePasswordPolicy, verifyPassword } from "../_shared/password.ts";
import { getClientIp, getUserAgent, requireActiveSession } from "../_shared/sessions.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";

Deno.serve((req) =>
  withJsonHandler(req, async () => {
    if (req.method !== "POST") {
      throw new HttpError(405, "bad_request", "Unsupported method.");
    }

    const body = (await req.json()) as {
      currentPassword?: string;
      newPassword?: string;
    };

    const currentPassword = body.currentPassword ?? "";
    const newPassword = body.newPassword ?? "";

    if (!currentPassword || !newPassword) {
      throw new HttpError(400, "bad_request", "Current password and new password are required.");
    }

    const passwordPolicyError = validatePasswordPolicy(newPassword);
    if (passwordPolicyError) {
      throw new HttpError(400, "bad_request", passwordPolicyError);
    }

    const supabase = createAdminClient();
    const session = await requireActiveSession(req, supabase);

    const { data: user, error: userError } = await supabase
      .from("app_users")
      .select("id, password_hash")
      .eq("id", session.userId)
      .single();

    if (userError || !user) {
      throw new HttpError(500, "internal_error", "Failed to load current user.", userError?.message);
    }

    const isValidPassword = await verifyPassword(currentPassword, user.password_hash as string);
    if (!isValidPassword) {
      throw new HttpError(401, "invalid_credentials", "Current password is incorrect.");
    }

    const nextPasswordHash = await createPasswordHash(newPassword);
    const { error: updateError } = await supabase
      .from("app_users")
      .update({
        password_hash: nextPasswordHash,
        must_change_password: false,
        login_enabled: true,
      })
      .eq("id", session.userId);

    if (updateError) {
      throw new HttpError(500, "internal_error", "Failed to update password.", updateError.message);
    }

    await writeAuditEvent(supabase, {
      actorUserId: session.userId,
      action: "auth.password_changed",
      entityType: "app_user",
      entityId: session.userId,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
      details: {
        via: "self_service",
      },
    });

    return jsonResponse(req, {
      ok: true,
    });
  }),
);
