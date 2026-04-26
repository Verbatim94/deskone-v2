import { HttpError } from "./http.ts";

type SupabaseAdminClient = ReturnType<typeof import("./supabase-admin.ts").createAdminClient>;

type SessionUser = {
  id: string;
  role: "super_admin" | "admin" | "user";
};

export type OrganizationScope = {
  id: string;
  name: string;
  slug: string;
  membershipRole: "admin" | "member";
};

export async function listAccessibleOrganizations(
  supabase: SupabaseAdminClient,
  user: SessionUser,
): Promise<OrganizationScope[]> {
  if (user.role === "super_admin") {
    const { data, error } = await supabase
      .from("organizations")
      .select("id, name, slug")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      throw new HttpError(500, "internal_error", "Failed to load organizations.", error.message);
    }

    return (data ?? []).map((organization) => ({
      id: organization.id as string,
      name: organization.name as string,
      slug: organization.slug as string,
      membershipRole: "admin" as const,
    }));
  }

  const { data, error } = await supabase
    .from("organization_memberships")
    .select(
      `
        role,
        organization:organizations!inner (
          id,
          name,
          slug,
          is_active
        )
      `,
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    throw new HttpError(500, "internal_error", "Failed to load organizations.", error.message);
  }

  return (data ?? []).flatMap((membership) => {
    const organization = membership.organization;

    if (!organization || organization.is_active !== true) {
      return [];
    }

    return [
      {
        id: organization.id as string,
        name: organization.name as string,
        slug: organization.slug as string,
        membershipRole: membership.role as "admin" | "member",
      },
    ];
  });
}

export async function requireOrganizationAccess(
  supabase: SupabaseAdminClient,
  user: SessionUser,
  organizationId: string,
  minimumRole: "member" | "admin" = "member",
): Promise<OrganizationScope> {
  if (!organizationId) {
    throw new HttpError(400, "bad_request", "organizationId is required.");
  }

  if (user.role === "super_admin") {
    const { data, error } = await supabase
      .from("organizations")
      .select("id, name, slug, is_active")
      .eq("id", organizationId)
      .maybeSingle();

    if (error) {
      throw new HttpError(500, "internal_error", "Failed to verify organization access.", error.message);
    }

    if (!data || data.is_active !== true) {
      throw new HttpError(404, "not_found", "Organization not found.");
    }

    return {
      id: data.id as string,
      name: data.name as string,
      slug: data.slug as string,
      membershipRole: "admin",
    };
  }

  const { data, error } = await supabase
    .from("organization_memberships")
    .select(
      `
        role,
        organization:organizations!inner (
          id,
          name,
          slug,
          is_active
        )
      `,
    )
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "internal_error", "Failed to verify organization access.", error.message);
  }

  if (!data || !data.organization || data.organization.is_active !== true) {
    throw new HttpError(403, "forbidden", "Missing organization scope.");
  }

  if (minimumRole === "admin" && data.role !== "admin") {
    throw new HttpError(403, "forbidden", "Organization admin scope is required.");
  }

  return {
    id: data.organization.id as string,
    name: data.organization.name as string,
    slug: data.organization.slug as string,
    membershipRole: data.role as "admin" | "member",
  };
}
