import { writeAuditEvent } from "../_shared/audit.ts";
import { requirePlatformRole } from "../_shared/authorization.ts";
import {
  normalizeOrganizationSlug,
  syncUserRolesToMemberships,
} from "../_shared/governance.ts";
import { withJsonHandler, HttpError, jsonResponse } from "../_shared/http.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { getClientIp, getUserAgent, requireActiveSession } from "../_shared/sessions.ts";
import { getUserDirectory } from "../_shared/user-directory.ts";

type CreateOrganizationBody = {
  organizationId?: string;
  name?: string;
  slug?: string;
  description?: string | null;
  isActive?: boolean;
  adminUserIds?: string[];
  memberUserIds?: string[];
};

function normalizeOrganizationName(value: unknown) {
  if (typeof value !== "string") {
    throw new HttpError(400, "bad_request", "Organization name is required.");
  }

  const normalized = value.replace(/\s+/g, " ").trim();

  if (!normalized || normalized.length > 120) {
    throw new HttpError(400, "bad_request", "Organization name must be between 1 and 120 characters.");
  }

  return normalized;
}

function normalizeOrganizationDescription(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, 500) : null;
}

function uniqueUserIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

async function assertUserIdsExist(
  supabase: ReturnType<typeof createAdminClient>,
  userIds: string[],
) {
  if (!userIds.length) {
    return;
  }

  const { data: existingUsers, error: existingUsersError } = await supabase
    .from("app_users")
    .select("id")
    .in("id", userIds);

  if (existingUsersError) {
    throw new HttpError(500, "internal_error", "Failed to validate organization members.", existingUsersError.message);
  }

  const existingUserIds = new Set((existingUsers ?? []).map((user) => user.id as string));
  const missingUserIds = userIds.filter((userId) => !existingUserIds.has(userId));

  if (missingUserIds.length) {
    throw new HttpError(400, "bad_request", "Some organization members do not exist.", { missingUserIds });
  }
}

Deno.serve((req) =>
  withJsonHandler(req, async () => {
    const supabase = createAdminClient();
    const session = await requireActiveSession(req, supabase);
    requirePlatformRole(session.user, "super_admin");

    if (req.method === "GET") {
      const includeInactive = new URL(req.url).searchParams.get("includeInactive") === "true";

      let query = supabase
        .from("organizations")
        .select("id, name, slug, description, is_active, created_at, updated_at")
        .order("created_at", { ascending: false })
        .limit(200);

      if (!includeInactive) {
        query = query.eq("is_active", true);
      }

      const { data: organizations, error: organizationsError } = await query;

      if (organizationsError) {
        throw new HttpError(500, "internal_error", "Failed to load organizations.", organizationsError.message);
      }

      const organizationIds = (organizations ?? []).map((organization) => organization.id as string);
      const { data: memberships, error: membershipsError } = organizationIds.length
        ? await supabase
            .from("organization_memberships")
            .select("organization_id, user_id, role")
            .in("organization_id", organizationIds)
        : { data: [], error: null };

      if (membershipsError) {
        throw new HttpError(500, "internal_error", "Failed to load organization memberships.", membershipsError.message);
      }

      const directory = await getUserDirectory(
        supabase,
        (memberships ?? []).map((membership) => membership.user_id as string),
      );

      return jsonResponse(req, {
        organizations: (organizations ?? []).map((organization) => {
          const organizationMemberships = (memberships ?? []).filter(
            (membership) => membership.organization_id === organization.id,
          );
          const adminMemberships = organizationMemberships.filter((membership) => membership.role === "admin");
          const memberCount = organizationMemberships.filter((membership) => membership.role === "member").length;

          return {
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
            description: organization.description,
            isActive: organization.is_active,
            createdAt: organization.created_at,
            updatedAt: organization.updated_at,
            adminCount: adminMemberships.length,
            memberCount,
            administrators: adminMemberships.map((membership) => ({
              userId: membership.user_id,
              displayName: directory[membership.user_id as string]?.displayName ?? "Unknown",
              email: directory[membership.user_id as string]?.email ?? null,
            })),
          };
        }),
      });
    }

    if (req.method === "POST") {
      const body = (await req.json()) as CreateOrganizationBody;
      const name = normalizeOrganizationName(body.name);
      const slug = normalizeOrganizationSlug(body.slug ?? name);
      const description = normalizeOrganizationDescription(body.description);
      const adminUserIds = uniqueUserIds(body.adminUserIds);
      const memberUserIds = uniqueUserIds(body.memberUserIds).filter((userId) => !adminUserIds.includes(userId));
      const relatedUserIds = [...adminUserIds, ...memberUserIds];

      if (relatedUserIds.length) {
        await assertUserIdsExist(supabase, relatedUserIds);
      }

      const { data: createdOrganization, error: createdOrganizationError } = await supabase
        .from("organizations")
        .insert({
          name,
          slug,
          description,
          created_by: session.userId,
        })
        .select("id, name, slug, description, is_active, created_at, updated_at")
        .single();

      if (createdOrganizationError || !createdOrganization) {
        throw new HttpError(
          createdOrganizationError?.code === "23505" ? 409 : 500,
          createdOrganizationError?.code === "23505" ? "conflict" : "internal_error",
          createdOrganizationError?.code === "23505"
            ? "An organization with this slug already exists."
            : "Failed to create organization.",
          createdOrganizationError?.message,
        );
      }

      if (relatedUserIds.length) {
        const membershipRows = [
          ...adminUserIds.map((userId) => ({
            organization_id: createdOrganization.id as string,
            user_id: userId,
            role: "admin" as const,
          })),
          ...memberUserIds.map((userId) => ({
            organization_id: createdOrganization.id as string,
            user_id: userId,
            role: "member" as const,
          })),
        ];

        if (membershipRows.length) {
          const { error: insertMembershipsError } = await supabase
            .from("organization_memberships")
            .insert(membershipRows);

          if (insertMembershipsError) {
            throw new HttpError(
              500,
              "internal_error",
              "Failed to save organization memberships.",
              insertMembershipsError.message,
            );
          }
        }

        await syncUserRolesToMemberships(supabase, relatedUserIds);
      }

      const directory = await getUserDirectory(supabase, adminUserIds);

      await writeAuditEvent(supabase, {
        actorUserId: session.userId,
        organizationId: createdOrganization.id as string,
        action: "organization.created",
        entityType: "organization",
        entityId: createdOrganization.id as string,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
        details: {
          slug,
          adminUserIds,
          memberUserIds,
        },
      });

      return jsonResponse(req, {
        organization: {
          id: createdOrganization.id,
          name: createdOrganization.name,
          slug: createdOrganization.slug,
          description: createdOrganization.description,
          isActive: createdOrganization.is_active,
          createdAt: createdOrganization.created_at,
          updatedAt: createdOrganization.updated_at,
          adminCount: adminUserIds.length,
          memberCount: memberUserIds.length,
          administrators: adminUserIds.map((userId) => ({
            userId,
            displayName: directory[userId]?.displayName ?? "Unknown",
            email: directory[userId]?.email ?? null,
          })),
        },
      });
    }

    if (req.method === "PATCH") {
      const body = (await req.json()) as CreateOrganizationBody;
      const organizationId = body.organizationId?.trim();

      if (!organizationId) {
        throw new HttpError(400, "bad_request", "organizationId is required.");
      }

      const { data: existingOrganization, error: existingOrganizationError } = await supabase
        .from("organizations")
        .select("id, name, slug, description, is_active")
        .eq("id", organizationId)
        .maybeSingle();

      if (existingOrganizationError) {
        throw new HttpError(500, "internal_error", "Failed to load organization.", existingOrganizationError.message);
      }

      if (!existingOrganization) {
        throw new HttpError(404, "not_found", "Organization not found.");
      }

      const name =
        body.name !== undefined ? normalizeOrganizationName(body.name) : (existingOrganization.name as string);
      const slug =
        body.slug !== undefined || body.name !== undefined
          ? normalizeOrganizationSlug(body.slug ?? name)
          : (existingOrganization.slug as string);
      const description =
        body.description !== undefined
          ? normalizeOrganizationDescription(body.description)
          : ((existingOrganization.description as string | null | undefined) ?? null);
      const isActive =
        typeof body.isActive === "boolean" ? body.isActive : (existingOrganization.is_active as boolean);
      const adminUserIds = uniqueUserIds(body.adminUserIds);
      const memberUserIds = uniqueUserIds(body.memberUserIds).filter((userId) => !adminUserIds.includes(userId));
      const nextMembershipUserIds = [...adminUserIds, ...memberUserIds];

      const { data: currentMemberships, error: currentMembershipsError } = await supabase
        .from("organization_memberships")
        .select("user_id")
        .eq("organization_id", organizationId);

      if (currentMembershipsError) {
        throw new HttpError(
          500,
          "internal_error",
          "Failed to load current organization memberships.",
          currentMembershipsError.message,
        );
      }

      if (nextMembershipUserIds.length) {
        await assertUserIdsExist(supabase, nextMembershipUserIds);
      }

      const { error: updateOrganizationError } = await supabase
        .from("organizations")
        .update({
          name,
          slug,
          description,
          is_active: isActive,
        })
        .eq("id", organizationId);

      if (updateOrganizationError) {
        throw new HttpError(
          updateOrganizationError.code === "23505" ? 409 : 500,
          updateOrganizationError.code === "23505" ? "conflict" : "internal_error",
          updateOrganizationError.code === "23505"
            ? "An organization with this slug already exists."
            : "Failed to update organization.",
          updateOrganizationError.message,
        );
      }

      const { error: deleteMembershipsError } = await supabase
        .from("organization_memberships")
        .delete()
        .eq("organization_id", organizationId);

      if (deleteMembershipsError) {
        throw new HttpError(
          500,
          "internal_error",
          "Failed to replace organization memberships.",
          deleteMembershipsError.message,
        );
      }

      const membershipRows = [
        ...adminUserIds.map((userId) => ({
          organization_id: organizationId,
          user_id: userId,
          role: "admin" as const,
        })),
        ...memberUserIds.map((userId) => ({
          organization_id: organizationId,
          user_id: userId,
          role: "member" as const,
        })),
      ];

      if (membershipRows.length) {
        const { error: insertMembershipsError } = await supabase
          .from("organization_memberships")
          .insert(membershipRows);

        if (insertMembershipsError) {
          throw new HttpError(
            500,
            "internal_error",
            "Failed to save organization memberships.",
            insertMembershipsError.message,
          );
        }
      }

      const affectedUserIds = Array.from(
        new Set([
          ...(currentMemberships ?? []).map((membership) => membership.user_id as string),
          ...nextMembershipUserIds,
        ]),
      );

      await syncUserRolesToMemberships(supabase, affectedUserIds);

      const directory = await getUserDirectory(supabase, adminUserIds);

      await writeAuditEvent(supabase, {
        actorUserId: session.userId,
        organizationId,
        action: "organization.updated",
        entityType: "organization",
        entityId: organizationId,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
        details: {
          slug,
          isActive,
          adminUserIds,
          memberUserIds,
        },
      });

      const { data: updatedOrganization, error: updatedOrganizationLookupError } = await supabase
        .from("organizations")
        .select("id, name, slug, description, is_active, created_at, updated_at")
        .eq("id", organizationId)
        .single();

      if (updatedOrganizationLookupError || !updatedOrganization) {
        throw new HttpError(
          500,
          "internal_error",
          "Failed to reload the updated organization.",
          updatedOrganizationLookupError?.message,
        );
      }

      return jsonResponse(req, {
        organization: {
          id: updatedOrganization.id,
          name: updatedOrganization.name,
          slug: updatedOrganization.slug,
          description: updatedOrganization.description,
          isActive: updatedOrganization.is_active,
          createdAt: updatedOrganization.created_at,
          updatedAt: updatedOrganization.updated_at,
          adminCount: adminUserIds.length,
          memberCount: memberUserIds.length,
          administrators: adminUserIds.map((userId) => ({
            userId,
            displayName: directory[userId]?.displayName ?? "Unknown",
            email: directory[userId]?.email ?? null,
          })),
        },
      });
    }

    throw new HttpError(405, "bad_request", "Unsupported method.");
  }),
);
