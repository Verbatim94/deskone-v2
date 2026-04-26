import { writeAuditEvent } from "../_shared/audit.ts";
import { requirePlatformRole } from "../_shared/authorization.ts";
import {
  assertOrganizationsExist,
  buildFullName,
  hydrateGovernanceUsers,
  normalizeMemberships,
  normalizeUserProfile,
  normalizeUsername,
  replaceOrganizationMemberships,
  validateUserRoleMemberships,
} from "../_shared/governance.ts";
import { withJsonHandler, HttpError, jsonResponse } from "../_shared/http.ts";
import { createPasswordHash, createTemporaryPassword, validatePasswordPolicy } from "../_shared/password.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { getClientIp, getUserAgent, requireActiveSession } from "../_shared/sessions.ts";

type GovernanceUserBody = {
  userId?: string;
  username?: string;
  password?: string;
  issueTemporaryPassword?: boolean;
  role?: "admin" | "user";
  isActive?: boolean;
  loginEnabled?: boolean;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  email?: string | null;
  employeeCode?: string | null;
  department?: string | null;
  jobTitle?: string | null;
  location?: string | null;
  phone?: string | null;
  timezone?: string | null;
  notes?: string | null;
  avatarUrl?: string | null;
  memberships?: Array<{
    organizationId?: string;
    role?: "admin" | "member";
  }>;
};

function parseBooleanFlag(value: string | null) {
  if (value === null) {
    return null;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new HttpError(400, "bad_request", "Boolean query values must be true or false.");
}

function normalizeMutableRole(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (value === "admin" || value === "user") {
    return value;
  }

  throw new HttpError(400, "bad_request", "role must be either admin or user.");
}

function normalizeRoleFilter(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (value === "super_admin" || value === "admin" || value === "user") {
    return value;
  }

  throw new HttpError(400, "bad_request", "role filter must be super_admin, admin or user.");
}

function normalizeOptionalBoolean(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  throw new HttpError(400, "bad_request", `${fieldName} must be a boolean.`);
}

function sanitizeSearchValue(value: string) {
  return value.replace(/[%(),]/g, " ").trim();
}

async function upsertLocalIdentity(
  supabase: ReturnType<typeof createAdminClient>,
  input: {
    userId: string;
    username: string;
    email: string | null;
  },
) {
  const { data: existingIdentity, error: identityLookupError } = await supabase
    .from("user_identities")
    .select("id")
    .eq("user_id", input.userId)
    .eq("provider", "local")
    .maybeSingle();

  if (identityLookupError) {
    throw new HttpError(500, "internal_error", "Failed to validate local identity.", identityLookupError.message);
  }

  if (existingIdentity?.id) {
    const { error: updateIdentityError } = await supabase
      .from("user_identities")
      .update({
        login_identifier: input.username,
        email: input.email,
        is_primary: true,
      })
      .eq("id", existingIdentity.id as string);

    if (updateIdentityError) {
      throw new HttpError(500, "internal_error", "Failed to update local identity.", updateIdentityError.message);
    }

    return;
  }

  const { error: insertIdentityError } = await supabase.from("user_identities").insert({
    user_id: input.userId,
    provider: "local",
    provider_subject: input.userId,
    login_identifier: input.username,
    email: input.email,
    is_primary: true,
  });

  if (insertIdentityError) {
    throw new HttpError(500, "internal_error", "Failed to create local identity.", insertIdentityError.message);
  }
}

Deno.serve((req) =>
  withJsonHandler(req, async () => {
    const supabase = createAdminClient();
    const session = await requireActiveSession(req, supabase);
    requirePlatformRole(session.user, "super_admin");

    if (req.method === "GET") {
      const url = new URL(req.url);
      const role = normalizeRoleFilter(url.searchParams.get("role") ?? undefined);
      const isActive = parseBooleanFlag(url.searchParams.get("isActive"));
      const search = sanitizeSearchValue(url.searchParams.get("search")?.trim() ?? "");
      const organizationId = url.searchParams.get("organizationId")?.trim() ?? null;

      let scopedUserIds: string[] | null = null;

      if (organizationId) {
        const { data: memberships, error: membershipsError } = await supabase
          .from("organization_memberships")
          .select("user_id")
          .eq("organization_id", organizationId);

        if (membershipsError) {
          throw new HttpError(500, "internal_error", "Failed to scope organization memberships.", membershipsError.message);
        }

        scopedUserIds = Array.from(new Set((memberships ?? []).map((membership) => membership.user_id as string)));

        if (!scopedUserIds.length) {
          return jsonResponse(req, { users: [] });
        }
      }

      let query = supabase
        .from("app_users")
        .select("id, username, full_name, role, is_active, login_enabled, must_change_password, last_login_at, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(200);

      if (role) {
        query = query.eq("role", role);
      }

      if (isActive !== null) {
        query = query.eq("is_active", isActive);
      }

      if (scopedUserIds) {
        query = query.in("id", scopedUserIds);
      }

      if (search) {
        query = query.or(`username.ilike.%${search}%,full_name.ilike.%${search}%`);
      }

      const { data: users, error: usersError } = await query;

      if (usersError) {
        throw new HttpError(500, "internal_error", "Failed to load users.", usersError.message);
      }

      const hydratedUsers = await hydrateGovernanceUsers(
        supabase,
        (users ?? []).map((user) => ({
          id: user.id as string,
          username: user.username as string,
          full_name: user.full_name as string,
          role: user.role as "super_admin" | "admin" | "user",
          is_active: user.is_active as boolean,
          login_enabled: user.login_enabled as boolean,
          must_change_password: user.must_change_password as boolean,
          last_login_at: (user.last_login_at as string | null | undefined) ?? null,
          created_at: user.created_at as string,
          updated_at: user.updated_at as string,
        })),
      );

      return jsonResponse(req, { users: hydratedUsers });
    }

    const body = (await req.json()) as GovernanceUserBody;
    const profile = normalizeUserProfile(body as Record<string, unknown>);

    if (req.method === "POST") {
      const username = normalizeUsername(body.username);
      const role = normalizeMutableRole(body.role) ?? "user";
      const loginEnabled = normalizeOptionalBoolean(body.loginEnabled, "loginEnabled") ?? true;
      const memberships = normalizeMemberships(body.memberships);
      validateUserRoleMemberships(role, memberships);
      await assertOrganizationsExist(supabase, memberships);

      const password = body.password ?? crypto.randomUUID();
      const passwordPolicyError = validatePasswordPolicy(password);
      if (loginEnabled && passwordPolicyError) {
        throw new HttpError(400, "bad_request", passwordPolicyError);
      }

      const passwordHash = await createPasswordHash(password);
      const fullName = buildFullName(username, profile);

      const { data: createdUser, error: createdUserError } = await supabase
        .from("app_users")
        .insert({
          username,
          full_name: fullName,
          password_hash: passwordHash,
          role,
          is_active: true,
          login_enabled: loginEnabled,
          must_change_password: false,
        })
        .select("id, username, full_name, role, is_active, login_enabled, must_change_password, last_login_at, created_at, updated_at")
        .single();

      if (createdUserError || !createdUser) {
        throw new HttpError(
          createdUserError?.code === "23505" ? 409 : 500,
          createdUserError?.code === "23505" ? "conflict" : "internal_error",
          createdUserError?.code === "23505" ? "Username or email already exists." : "Failed to create user.",
          createdUserError?.message,
        );
      }

      const { error: profileError } = await supabase.from("user_profiles").insert({
        user_id: createdUser.id,
        first_name: profile.firstName,
        last_name: profile.lastName,
        display_name: profile.displayName,
        email: profile.email,
        employee_code: profile.employeeCode,
        department: profile.department,
        job_title: profile.jobTitle,
        location: profile.location,
        phone: profile.phone,
        timezone: profile.timezone,
        notes: profile.notes,
        avatar_url: profile.avatarUrl,
      });

      if (profileError) {
        throw new HttpError(500, "internal_error", "Failed to create user profile.", profileError.message);
      }

      await upsertLocalIdentity(supabase, {
        userId: createdUser.id as string,
        username,
        email: profile.email,
      });

      await replaceOrganizationMemberships(supabase, createdUser.id as string, memberships);

      await writeAuditEvent(supabase, {
        actorUserId: session.userId,
        organizationId: memberships[0]?.organizationId ?? null,
        action: "user.created",
        entityType: "app_user",
        entityId: createdUser.id as string,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
        details: {
          username,
          role,
          membershipCount: memberships.length,
          loginEnabled,
        },
      });

      const [hydratedUser] = await hydrateGovernanceUsers(supabase, [
        {
          id: createdUser.id as string,
          username: createdUser.username as string,
          full_name: createdUser.full_name as string,
          role: createdUser.role as "super_admin" | "admin" | "user",
          is_active: createdUser.is_active as boolean,
          login_enabled: createdUser.login_enabled as boolean,
          must_change_password: createdUser.must_change_password as boolean,
          last_login_at: (createdUser.last_login_at as string | null | undefined) ?? null,
          created_at: createdUser.created_at as string,
          updated_at: createdUser.updated_at as string,
        },
      ]);

      return jsonResponse(req, { user: hydratedUser });
    }

    if (req.method === "PATCH") {
      const userId = body.userId?.trim();

      if (!userId) {
        throw new HttpError(400, "bad_request", "userId is required.");
      }

      const { data: existingUser, error: existingUserError } = await supabase
        .from("app_users")
        .select("id, username, full_name, role, is_active, login_enabled, must_change_password, session_version, last_login_at, created_at, updated_at")
        .eq("id", userId)
        .maybeSingle();

      if (existingUserError) {
        throw new HttpError(500, "internal_error", "Failed to load user.", existingUserError.message);
      }

      if (!existingUser) {
        throw new HttpError(404, "not_found", "User not found.");
      }

      if (existingUser.role === "super_admin") {
        if (body.role !== undefined) {
          throw new HttpError(400, "bad_request", "Super-admin role changes are not allowed through this endpoint.");
        }

        if (body.memberships !== undefined) {
          throw new HttpError(400, "bad_request", "Super-admin memberships are managed separately.");
        }

        if (body.isActive === false) {
          throw new HttpError(400, "bad_request", "The bootstrap super-admin cannot be deactivated from this endpoint.");
        }

        if (body.loginEnabled === false) {
          throw new HttpError(400, "bad_request", "The bootstrap super-admin login cannot be disabled from this endpoint.");
        }

        if (body.issueTemporaryPassword === true) {
          throw new HttpError(400, "bad_request", "The bootstrap super-admin password cannot be rotated from this endpoint.");
        }
      }

      const { data: existingProfile, error: existingProfileError } = await supabase
        .from("user_profiles")
        .select(
          "first_name, last_name, display_name, email, employee_code, department, job_title, location, phone, timezone, notes, avatar_url",
        )
        .eq("user_id", userId)
        .maybeSingle();

      if (existingProfileError) {
        throw new HttpError(500, "internal_error", "Failed to load existing user profile.", existingProfileError.message);
      }

      const mergedProfile = {
        firstName: body.firstName !== undefined ? profile.firstName : (existingProfile?.first_name as string | null | undefined) ?? null,
        lastName: body.lastName !== undefined ? profile.lastName : (existingProfile?.last_name as string | null | undefined) ?? null,
        displayName:
          body.displayName !== undefined ? profile.displayName : (existingProfile?.display_name as string | null | undefined) ?? null,
        email: body.email !== undefined ? profile.email : (existingProfile?.email as string | null | undefined) ?? null,
        employeeCode:
          body.employeeCode !== undefined
            ? profile.employeeCode
            : (existingProfile?.employee_code as string | null | undefined) ?? null,
        department:
          body.department !== undefined ? profile.department : (existingProfile?.department as string | null | undefined) ?? null,
        jobTitle:
          body.jobTitle !== undefined ? profile.jobTitle : (existingProfile?.job_title as string | null | undefined) ?? null,
        location:
          body.location !== undefined ? profile.location : (existingProfile?.location as string | null | undefined) ?? null,
        phone: body.phone !== undefined ? profile.phone : (existingProfile?.phone as string | null | undefined) ?? null,
        timezone:
          body.timezone !== undefined ? profile.timezone : (existingProfile?.timezone as string | null | undefined) ?? null,
        notes: body.notes !== undefined ? profile.notes : (existingProfile?.notes as string | null | undefined) ?? null,
        avatarUrl:
          body.avatarUrl !== undefined ? profile.avatarUrl : (existingProfile?.avatar_url as string | null | undefined) ?? null,
      };

      const nextRole =
        existingUser.role === "super_admin"
          ? "super_admin"
          : normalizeMutableRole(body.role) ?? (existingUser.role as "admin" | "user");
      const nextLoginEnabled = normalizeOptionalBoolean(body.loginEnabled, "loginEnabled");
      const issueTemporaryPassword = normalizeOptionalBoolean(body.issueTemporaryPassword, "issueTemporaryPassword") ?? false;
      const hasMembershipUpdate = body.memberships !== undefined;
      const memberships = hasMembershipUpdate ? normalizeMemberships(body.memberships) : [];

      if (body.role !== undefined && !hasMembershipUpdate && body.role !== existingUser.role) {
        throw new HttpError(
          400,
          "bad_request",
          "memberships must be provided when changing a user role, so scope stays consistent.",
        );
      }

      if (hasMembershipUpdate) {
        validateUserRoleMemberships(nextRole, memberships);
        await assertOrganizationsExist(supabase, memberships);
      }

      const username = body.username ? normalizeUsername(body.username) : (existingUser.username as string);
      if (issueTemporaryPassword && body.password) {
        throw new HttpError(400, "bad_request", "Provide either password or issueTemporaryPassword, not both.");
      }

      const generatedTemporaryPassword = issueTemporaryPassword ? createTemporaryPassword() : null;
      const password = generatedTemporaryPassword ?? body.password ?? "";

      if (password) {
        const passwordPolicyError = validatePasswordPolicy(password);
        if (passwordPolicyError) {
          throw new HttpError(400, "bad_request", passwordPolicyError);
        }
      }

      const fullName = buildFullName(username, mergedProfile);
      const updatePayload: Record<string, unknown> = {
        username,
        full_name: fullName,
        role: nextRole,
      };

      if (typeof body.isActive === "boolean") {
        updatePayload.is_active = body.isActive;
      }

      if (typeof nextLoginEnabled === "boolean") {
        updatePayload.login_enabled = nextLoginEnabled;
      }

      if (password) {
        updatePayload.password_hash = await createPasswordHash(password);
        updatePayload.must_change_password = issueTemporaryPassword;
      }

      if (issueTemporaryPassword) {
        updatePayload.login_enabled = true;
        updatePayload.is_active = true;
        updatePayload.session_version = Number(existingUser.session_version) + 1;
      }

      const { data: updatedUser, error: updatedUserError } = await supabase
        .from("app_users")
        .update(updatePayload)
        .eq("id", userId)
        .select("id, username, full_name, role, is_active, login_enabled, must_change_password, last_login_at, created_at, updated_at")
        .single();

      if (updatedUserError || !updatedUser) {
        throw new HttpError(
          updatedUserError?.code === "23505" ? 409 : 500,
          updatedUserError?.code === "23505" ? "conflict" : "internal_error",
          updatedUserError?.code === "23505" ? "Username or email already exists." : "Failed to update user.",
          updatedUserError?.message,
        );
      }

      const { error: upsertProfileError } = await supabase.from("user_profiles").upsert({
        user_id: userId,
        first_name: mergedProfile.firstName,
        last_name: mergedProfile.lastName,
        display_name: mergedProfile.displayName,
        email: mergedProfile.email,
        employee_code: mergedProfile.employeeCode,
        department: mergedProfile.department,
        job_title: mergedProfile.jobTitle,
        location: mergedProfile.location,
        phone: mergedProfile.phone,
        timezone: mergedProfile.timezone,
        notes: mergedProfile.notes,
        avatar_url: mergedProfile.avatarUrl,
      });

      if (upsertProfileError) {
        throw new HttpError(500, "internal_error", "Failed to update user profile.", upsertProfileError.message);
      }

      await upsertLocalIdentity(supabase, {
        userId,
        username,
        email: mergedProfile.email,
      });

      if (hasMembershipUpdate) {
        await replaceOrganizationMemberships(supabase, userId, memberships);
      }

      await writeAuditEvent(supabase, {
        actorUserId: session.userId,
        organizationId: memberships[0]?.organizationId ?? null,
        action: "user.updated",
        entityType: "app_user",
        entityId: userId,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
        details: {
          role: nextRole,
          isActive: typeof body.isActive === "boolean" ? body.isActive : undefined,
          loginEnabled: nextLoginEnabled,
          membershipCount: hasMembershipUpdate ? memberships.length : undefined,
          passwordUpdated: Boolean(password),
          temporaryPasswordIssued: issueTemporaryPassword,
        },
      });

      const [hydratedUser] = await hydrateGovernanceUsers(supabase, [
        {
          id: updatedUser.id as string,
          username: updatedUser.username as string,
          full_name: updatedUser.full_name as string,
          role: updatedUser.role as "super_admin" | "admin" | "user",
          is_active: updatedUser.is_active as boolean,
          login_enabled: updatedUser.login_enabled as boolean,
          must_change_password: updatedUser.must_change_password as boolean,
          last_login_at: (updatedUser.last_login_at as string | null | undefined) ?? null,
          created_at: updatedUser.created_at as string,
          updated_at: updatedUser.updated_at as string,
        },
      ]);

      return jsonResponse(req, {
        user: hydratedUser,
        issuedCredentials: generatedTemporaryPassword
          ? {
              temporaryPassword: generatedTemporaryPassword,
              mustChangePassword: true,
            }
          : null,
      });
    }

    throw new HttpError(405, "bad_request", "Unsupported method.");
  }),
);
