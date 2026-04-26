import { withJsonHandler, HttpError, jsonResponse } from "../_shared/http.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { buildSessionView } from "../_shared/session-view.ts";
import { requireActiveSession } from "../_shared/sessions.ts";

Deno.serve((req) =>
  withJsonHandler(req, async () => {
    if (req.method !== "GET") {
      throw new HttpError(405, "bad_request", "Unsupported method.");
    }

    const supabase = createAdminClient();
    const session = await requireActiveSession(req, supabase);
    const sessionView = await buildSessionView(supabase, session);

    return jsonResponse(req, sessionView);
  }),
);
