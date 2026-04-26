import type { ActiveSession } from "./sessions.ts";
import {
  listSupportedIdentityProviders,
  listUserIdentitySummaries,
  resolvePrimaryIdentityProvider,
} from "./identity-providers.ts";
import { listAccessibleOrganizations } from "./organizations.ts";

type SupabaseAdminClient = ReturnType<typeof import("./supabase-admin.ts").createAdminClient>;

export async function buildSessionView(supabase: SupabaseAdminClient, session: ActiveSession) {
  const [{ data: profile, error: profileError }, organizations, identities] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("display_name, email, first_name, last_name")
      .eq("user_id", session.userId)
      .maybeSingle(),
    listAccessibleOrganizations(supabase, session.user),
    listUserIdentitySummaries(supabase, session.userId),
  ]);

  if (profileError) {
    throw new Error(`Failed to load user profile: ${profileError.message}`);
  }

  const displayName =
    (profile?.display_name as string | null | undefined) ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
    session.user.fullName;
  const primaryIdentityProvider = resolvePrimaryIdentityProvider(identities);

  return {
    sessionId: session.sessionId,
    expiresAt: session.expiresAt,
    identityProviders: listSupportedIdentityProviders(),
    user: {
      id: session.user.id,
      username: session.user.username,
      role: session.user.role,
      fullName: session.user.fullName,
      displayName,
      email: (profile?.email as string | null | undefined) ?? null,
      mustChangePassword: session.user.mustChangePassword,
      primaryIdentityProvider,
      identities,
    },
    organizations,
  };
}
