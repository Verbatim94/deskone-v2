import { writeAuditEvent } from "../_shared/audit.ts";
import { buildResponseHeaders, HttpError, withJsonHandler } from "../_shared/http.ts";
import { getClientIp, getUserAgent, requireActiveSession } from "../_shared/sessions.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";

Deno.serve((req) =>
  withJsonHandler(req, async () => {
    if (req.method !== "POST") {
      throw new HttpError(405, "bad_request", "Unsupported method.");
    }

    const supabase = createAdminClient();
    const activeSession = await requireActiveSession(req, supabase);

    const nextSessionVersion = await (async () => {
      const { data: user, error: userError } = await supabase
        .from("app_users")
        .select("session_version")
        .eq("id", activeSession.userId)
        .single();

      if (userError || !user) {
        throw new HttpError(500, "internal_error", "Failed to load user session metadata.", userError?.message);
      }

      return Number(user.session_version) + 1;
    })();

    const { error: updateUserError } = await supabase
      .from("app_users")
      .update({ session_version: nextSessionVersion })
      .eq("id", activeSession.userId);

    if (updateUserError) {
      throw new HttpError(500, "internal_error", "Failed to rotate the user session version.", updateUserError.message);
    }

    const { error: revokeSessionsError } = await supabase
      .from("app_sessions")
      .update({
        revoked_at: new Date().toISOString(),
        revoked_reason: "user_revoked_all",
      })
      .eq("user_id", activeSession.userId)
      .is("revoked_at", null);

    if (revokeSessionsError) {
      throw new HttpError(500, "internal_error", "Failed to revoke active sessions.", revokeSessionsError.message);
    }

    await writeAuditEvent(supabase, {
      actorUserId: activeSession.userId,
      action: "auth.revoke_all.succeeded",
      entityType: "app_user",
      entityId: activeSession.userId,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
      details: {
        previousSessionId: activeSession.sessionId,
        nextSessionVersion,
      },
    });

    return new Response(null, {
      status: 204,
      headers: buildResponseHeaders(req),
    });
  }),
);
