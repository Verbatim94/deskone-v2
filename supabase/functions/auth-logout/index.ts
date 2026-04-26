import { withJsonHandler, HttpError, buildResponseHeaders } from "../_shared/http.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { extractBearerToken, getClientIp, getUserAgent, hashSessionToken, requireActiveSession } from "../_shared/sessions.ts";
import { writeAuditEvent } from "../_shared/audit.ts";

Deno.serve((req) =>
  withJsonHandler(req, async () => {
    if (req.method !== "POST") {
      throw new HttpError(405, "bad_request", "Unsupported method.");
    }

    const sessionToken = extractBearerToken(req);

    if (!sessionToken) {
      throw new HttpError(401, "unauthorized", "Missing session token.");
    }

    const supabase = createAdminClient();
    const activeSession = await requireActiveSession(req, supabase);
    const sessionTokenHash = await hashSessionToken(sessionToken);

    const { error } = await supabase
      .from("app_sessions")
      .update({
        revoked_at: new Date().toISOString(),
        revoked_reason: "user_logout",
      })
      .eq("session_token_hash", sessionTokenHash)
      .is("revoked_at", null);

    if (error) {
      throw new HttpError(500, "internal_error", "Failed to revoke session.", error.message);
    }

    await writeAuditEvent(supabase, {
      actorUserId: activeSession.userId,
      action: "auth.logout.succeeded",
      entityType: "app_session",
      entityId: activeSession.sessionId,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });

    return new Response(null, {
      status: 204,
      headers: buildResponseHeaders(req),
    });
  }),
);
