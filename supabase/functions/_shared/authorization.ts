import { HttpError } from "./http.ts";

type SupabaseAdminClient = ReturnType<typeof import("./supabase-admin.ts").createAdminClient>;

type SessionUser = {
  id: string;
  username: string;
  role: "super_admin" | "admin" | "user";
};

const roleRank: Record<SessionUser["role"], number> = {
  user: 0,
  admin: 1,
  super_admin: 2,
};

export function requirePlatformRole(user: SessionUser, minimumRole: SessionUser["role"]) {
  if (roleRank[user.role] < roleRank[minimumRole]) {
    throw new HttpError(403, "forbidden", "Insufficient platform privileges.");
  }
}

export async function requireOrganizationAdmin(
  supabase: SupabaseAdminClient,
  user: SessionUser,
  organizationId: string,
) {
  if (user.role === "super_admin") {
    return;
  }

  const { data, error } = await supabase
    .from("organization_memberships")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (error || !data) {
    throw new HttpError(403, "forbidden", "Missing organization admin scope.");
  }
}
