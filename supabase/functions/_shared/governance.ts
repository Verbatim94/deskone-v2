import { HttpError } from "./http.ts";

type SupabaseAdminClient = ReturnType<typeof import("./supabase-admin.ts").createAdminClient>;

export type GovernanceMembershipRole = "admin" | "member";

export type GovernanceMembershipInput = {
  organizationId: string;
  role: GovernanceMembershipRole;
};

export type GovernanceUserBase = {
  id: string;
  username: string;
  full_name: string;
  role: "super_admin" | "admin" | "user";
  is_active: boolean;
  login_enabled: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

type GovernanceUserProfileRecord = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  email: string | null;
  employee_code: string | null;
  department: string | null;
  job_title: string | null;
  location: string | null;
  phone: string | null;
  timezone: string | null;
  notes: string | null;
  avatar_url: string | null;
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeOptionalText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeWhitespace(value);

  if (!normalized) {
    return null;
  }

  if (normalized.length > maxLength) {
    throw new HttpError(400, "bad_request", `Field exceeds the ${maxLength} character limit.`);
  }

  return normalized;
}

export function normalizeUsername(value: unknown) {
  if (typeof value !== "string") {
    throw new HttpError(400, "bad_request", "username is required.");
  }

  const normalized = normalizeWhitespace(value).toLowerCase();

  if (!/^[a-z0-9._-]{3,64}$/.test(normalized)) {
    throw new HttpError(
      400,
      "bad_request",
      "Username must be 3-64 characters and use only letters, numbers, dots, underscores or dashes.",
    );
  }

  return normalized;
}

export function normalizeOrganizationSlug(value: unknown) {
  if (typeof value !== "string") {
    throw new HttpError(400, "bad_request", "Organization slug is required.");
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    throw new HttpError(400, "bad_request", "Organization slug format is invalid.");
  }

  if (normalized.length > 80) {
    throw new HttpError(400, "bad_request", "Organization slug must stay within 80 characters.");
  }

  return normalized;
}

export function normalizeUserProfile(input: Record<string, unknown>) {
  return {
    firstName: normalizeOptionalText(input.firstName, 80),
    lastName: normalizeOptionalText(input.lastName, 80),
    displayName: normalizeOptionalText(input.displayName, 120),
    email: normalizeOptionalText(input.email, 160)?.toLowerCase() ?? null,
    employeeCode: normalizeOptionalText(input.employeeCode, 80),
    department: normalizeOptionalText(input.department, 120),
    jobTitle: normalizeOptionalText(input.jobTitle, 120),
    location: normalizeOptionalText(input.location, 120),
    phone: normalizeOptionalText(input.phone, 40),
    timezone: normalizeOptionalText(input.timezone, 80),
    notes: normalizeOptionalText(input.notes, 2000),
    avatarUrl: normalizeOptionalText(input.avatarUrl, 400),
  };
}

export function buildFullName(username: string, profile: ReturnType<typeof normalizeUserProfile>) {
  return (
    profile.displayName ||
    [profile.firstName, profile.lastName].filter(Boolean).join(" ") ||
    username
  );
}

export function normalizeMemberships(value: unknown): GovernanceMembershipInput[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new HttpError(400, "bad_request", "memberships must be an array.");
  }

  const normalizedMemberships = new Map<string, GovernanceMembershipRole>();

  for (const membership of value) {
    if (!membership || typeof membership !== "object") {
      throw new HttpError(400, "bad_request", "Each membership must be an object.");
    }

    const rawOrganizationId = "organizationId" in membership ? membership.organizationId : null;
    const rawRole = "role" in membership ? membership.role : null;
    const organizationId = typeof rawOrganizationId === "string" ? rawOrganizationId.trim() : "";
    const role = rawRole === "admin" ? "admin" : rawRole === "member" ? "member" : null;

    if (!organizationId || !role) {
      throw new HttpError(400, "bad_request", "Each membership requires organizationId and role.");
    }

    const existingRole = normalizedMemberships.get(organizationId);
    normalizedMemberships.set(
      organizationId,
      existingRole === "admin" || role === "admin" ? "admin" : "member",
    );
  }

  return Array.from(normalizedMemberships.entries()).map(([organizationId, role]) => ({
    organizationId,
    role,
  }));
}

export function validateUserRoleMemberships(
  role: "super_admin" | "admin" | "user",
  memberships: GovernanceMembershipInput[],
) {
  if (role === "admin" && !memberships.some((membership) => membership.role === "admin")) {
    throw new HttpError(
      400,
      "bad_request",
      "An admin user must have at least one organization membership with admin scope.",
    );
  }

  if (role === "user" && memberships.some((membership) => membership.role === "admin")) {
    throw new HttpError(400, "bad_request", "A user cannot receive organization admin scope.");
  }
}

export async function assertOrganizationsExist(
  supabase: SupabaseAdminClient,
  memberships: GovernanceMembershipInput[],
) {
  const organizationIds = Array.from(new Set(memberships.map((membership) => membership.organizationId)));

  if (!organizationIds.length) {
    return;
  }

  const { data, error } = await supabase
    .from("organizations")
    .select("id")
    .in("id", organizationIds)
    .eq("is_active", true);

  if (error) {
    throw new HttpError(500, "internal_error", "Failed to validate organizations.", error.message);
  }

  const existingOrganizationIds = new Set((data ?? []).map((organization) => organization.id as string));
  const missingOrganizationIds = organizationIds.filter((organizationId) => !existingOrganizationIds.has(organizationId));

  if (missingOrganizationIds.length) {
    throw new HttpError(400, "bad_request", "Some memberships point to unknown or inactive organizations.", {
      missingOrganizationIds,
    });
  }
}

export async function replaceOrganizationMemberships(
  supabase: SupabaseAdminClient,
  userId: string,
  memberships: GovernanceMembershipInput[],
) {
  const { error: deleteError } = await supabase
    .from("organization_memberships")
    .delete()
    .eq("user_id", userId);

  if (deleteError) {
    throw new HttpError(500, "internal_error", "Failed to replace organization memberships.", deleteError.message);
  }

  if (!memberships.length) {
    return;
  }

  const { error: insertError } = await supabase.from("organization_memberships").insert(
    memberships.map((membership) => ({
      organization_id: membership.organizationId,
      user_id: userId,
      role: membership.role,
    })),
  );

  if (insertError) {
    throw new HttpError(500, "internal_error", "Failed to save organization memberships.", insertError.message);
  }
}

export async function syncUserRolesToMemberships(
  supabase: SupabaseAdminClient,
  userIds: string[],
) {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));

  if (!uniqueUserIds.length) {
    return;
  }

  const [{ data: users, error: usersError }, { data: memberships, error: membershipsError }] = await Promise.all([
    supabase
      .from("app_users")
      .select("id, role")
      .in("id", uniqueUserIds),
    supabase
      .from("organization_memberships")
      .select("user_id, role")
      .in("user_id", uniqueUserIds),
  ]);

  if (usersError) {
    throw new HttpError(500, "internal_error", "Failed to load users for role sync.", usersError.message);
  }

  if (membershipsError) {
    throw new HttpError(
      500,
      "internal_error",
      "Failed to load organization memberships for role sync.",
      membershipsError.message,
    );
  }

  const membershipsByUserId = new Map<string, GovernanceMembershipRole[]>();
  for (const membership of memberships ?? []) {
    const currentRoles = membershipsByUserId.get(membership.user_id as string) ?? [];
    currentRoles.push(membership.role as GovernanceMembershipRole);
    membershipsByUserId.set(membership.user_id as string, currentRoles);
  }

  const promoteToAdminIds: string[] = [];
  const demoteToUserIds: string[] = [];

  for (const user of users ?? []) {
    const currentRole = user.role as "super_admin" | "admin" | "user";

    if (currentRole === "super_admin") {
      continue;
    }

    const hasAdminMembership = (membershipsByUserId.get(user.id as string) ?? []).includes("admin");
    const nextRole = hasAdminMembership ? "admin" : "user";

    if (currentRole === nextRole) {
      continue;
    }

    if (nextRole === "admin") {
      promoteToAdminIds.push(user.id as string);
    } else {
      demoteToUserIds.push(user.id as string);
    }
  }

  if (promoteToAdminIds.length) {
    const { error: promoteError } = await supabase
      .from("app_users")
      .update({ role: "admin" })
      .in("id", promoteToAdminIds);

    if (promoteError) {
      throw new HttpError(500, "internal_error", "Failed to promote organization admins.", promoteError.message);
    }
  }

  if (demoteToUserIds.length) {
    const { error: demoteError } = await supabase
      .from("app_users")
      .update({ role: "user" })
      .in("id", demoteToUserIds);

    if (demoteError) {
      throw new HttpError(500, "internal_error", "Failed to demote users outside admin scope.", demoteError.message);
    }
  }
}

export async function hydrateGovernanceUsers(
  supabase: SupabaseAdminClient,
  users: GovernanceUserBase[],
) {
  const userIds = users.map((user) => user.id);

  if (!userIds.length) {
    return [];
  }

  const [{ data: profiles, error: profilesError }, { data: memberships, error: membershipsError }, { data: identities, error: identitiesError }] =
    await Promise.all([
      supabase
        .from("user_profiles")
        .select(
          "user_id, first_name, last_name, display_name, email, employee_code, department, job_title, location, phone, timezone, notes, avatar_url",
        )
        .in("user_id", userIds),
      supabase
        .from("organization_memberships")
        .select(
          `
            user_id,
            role,
            organization:organizations!inner (
              id,
              name,
              slug,
              is_active
            )
          `,
        )
        .in("user_id", userIds)
        .order("created_at", { ascending: true }),
      supabase
        .from("user_identities")
        .select("user_id, provider, provider_subject, provider_tenant_id, login_identifier, email, is_primary, last_synced_at")
        .in("user_id", userIds)
        .order("created_at", { ascending: true }),
    ]);

  if (profilesError) {
    throw new HttpError(500, "internal_error", "Failed to load user profiles.", profilesError.message);
  }

  if (membershipsError) {
    throw new HttpError(500, "internal_error", "Failed to load organization memberships.", membershipsError.message);
  }

  if (identitiesError) {
    throw new HttpError(500, "internal_error", "Failed to load user identities.", identitiesError.message);
  }

  const profileByUserId = new Map<string, GovernanceUserProfileRecord>(
    (profiles ?? []).map((profile) => [
      profile.user_id as string,
      {
        user_id: profile.user_id as string,
        first_name: (profile.first_name as string | null | undefined) ?? null,
        last_name: (profile.last_name as string | null | undefined) ?? null,
        display_name: (profile.display_name as string | null | undefined) ?? null,
        email: (profile.email as string | null | undefined) ?? null,
        employee_code: (profile.employee_code as string | null | undefined) ?? null,
        department: (profile.department as string | null | undefined) ?? null,
        job_title: (profile.job_title as string | null | undefined) ?? null,
        location: (profile.location as string | null | undefined) ?? null,
        phone: (profile.phone as string | null | undefined) ?? null,
        timezone: (profile.timezone as string | null | undefined) ?? null,
        notes: (profile.notes as string | null | undefined) ?? null,
        avatar_url: (profile.avatar_url as string | null | undefined) ?? null,
      },
    ]),
  );

  const membershipsByUserId = new Map<string, Array<Record<string, unknown>>>();
  for (const membership of memberships ?? []) {
    const userMemberships = membershipsByUserId.get(membership.user_id as string) ?? [];
    userMemberships.push({
      organizationId: membership.organization?.id,
      organizationName: membership.organization?.name,
      organizationSlug: membership.organization?.slug,
      role: membership.role,
    });
    membershipsByUserId.set(membership.user_id as string, userMemberships);
  }

  const identitiesByUserId = new Map<string, Array<Record<string, unknown>>>();
  for (const identity of identities ?? []) {
    const userIdentities = identitiesByUserId.get(identity.user_id as string) ?? [];
    userIdentities.push({
      provider: identity.provider,
      providerSubject: identity.provider_subject,
      providerTenantId: identity.provider_tenant_id,
      loginIdentifier: identity.login_identifier,
      email: identity.email,
      isPrimary: identity.is_primary,
      lastSyncedAt: identity.last_synced_at,
    });
    identitiesByUserId.set(identity.user_id as string, userIdentities);
  }

  return users.map((user) => {
    const profile = profileByUserId.get(user.id);
    const memberships = membershipsByUserId.get(user.id) ?? [];
    const identities = identitiesByUserId.get(user.id) ?? [];

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      fullName: user.full_name,
      isActive: user.is_active,
      loginEnabled: user.login_enabled,
      lastLoginAt: user.last_login_at,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      profile: {
        firstName: profile?.first_name ?? null,
        lastName: profile?.last_name ?? null,
        displayName: profile?.display_name ?? null,
        email: profile?.email ?? null,
        employeeCode: profile?.employee_code ?? null,
        department: profile?.department ?? null,
        jobTitle: profile?.job_title ?? null,
        location: profile?.location ?? null,
        phone: profile?.phone ?? null,
        timezone: profile?.timezone ?? null,
        notes: profile?.notes ?? null,
        avatarUrl: profile?.avatar_url ?? null,
      },
      memberships,
      identities,
    };
  });
}
