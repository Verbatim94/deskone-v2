import { writeAuditEvent } from "../_shared/audit.ts";
import { requireOrganizationAccess } from "../_shared/organizations.ts";
import {
  assertOrganizationRoomIds,
  assertOrganizationUserIds,
  listOrganizationGroupsBasic,
  listOrganizationMembers,
  listOrganizationRoomsBasic,
  normalizeOptionalText,
  normalizeRequiredName,
  normalizeSlug,
} from "../_shared/organization-admin.ts";
import { withJsonHandler, HttpError, jsonResponse } from "../_shared/http.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { getClientIp, getUserAgent, requireActiveSession } from "../_shared/sessions.ts";
import { getUserDirectory } from "../_shared/user-directory.ts";

type SharingGroupAccessInput = {
  roomId?: string;
  role?: "admin" | "member";
};

type SharingGroupBody = {
  organizationId?: string;
  groupId?: string;
  name?: string;
  slug?: string;
  description?: string | null;
  memberUserIds?: string[];
  roomAccess?: SharingGroupAccessInput[];
};

function normalizeRoomAccess(value: unknown) {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new HttpError(400, "bad_request", "roomAccess must be an array.");
  }

  const normalizedAccess = new Map<string, "admin" | "member">();

  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      throw new HttpError(400, "bad_request", "Each room access entry must be an object.");
    }

    const roomId = "roomId" in entry && typeof entry.roomId === "string" ? entry.roomId.trim() : "";
    const role = "role" in entry && entry.role === "admin" ? "admin" : "member";

    if (!roomId) {
      throw new HttpError(400, "bad_request", "Each room access entry requires roomId.");
    }

    const existingRole = normalizedAccess.get(roomId);
    normalizedAccess.set(roomId, existingRole === "admin" || role === "admin" ? "admin" : "member");
  }

  return Array.from(normalizedAccess.entries()).map(([roomId, role]) => ({
    roomId,
    role,
  }));
}

async function buildGroupViews(
  supabase: ReturnType<typeof createAdminClient>,
  organizationId: string,
) {
  const [groups, organizationUsers, organizationRooms] = await Promise.all([
    listOrganizationGroupsBasic(supabase, organizationId),
    listOrganizationMembers(supabase, organizationId),
    listOrganizationRoomsBasic(supabase, organizationId),
  ]);

  const groupIds = groups.map((group) => group.id);

  const [
    { data: groupMemberships, error: groupMembershipsError },
    { data: roomMemberships, error: roomMembershipsError },
  ] = await Promise.all([
    groupIds.length
      ? supabase
          .from("sharing_group_memberships")
          .select("group_id, user_id")
          .in("group_id", groupIds)
      : Promise.resolve({ data: [], error: null }),
    groupIds.length
      ? supabase
          .from("room_group_memberships")
          .select("group_id, room_id, role")
          .in("group_id", groupIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (groupMembershipsError || roomMembershipsError) {
    throw new HttpError(
      500,
      "internal_error",
      "Failed to load sharing group memberships.",
      groupMembershipsError?.message || roomMembershipsError?.message,
    );
  }

  const userDirectory = await getUserDirectory(
    supabase,
    (groupMemberships ?? []).map((membership) => membership.user_id as string),
  );

  const roomById = new Map(organizationRooms.map((room) => [room.id, room]));
  const memberById = new Map(organizationUsers.map((user) => [user.userId, user]));

  return {
    availableUsers: organizationUsers,
    availableRooms: organizationRooms,
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      slug: group.slug,
      description: group.description,
      members: (groupMemberships ?? [])
        .filter((membership) => membership.group_id === group.id)
        .map((membership) => ({
          userId: membership.user_id as string,
          username: memberById.get(membership.user_id as string)?.username ?? null,
          displayName: userDirectory[membership.user_id as string]?.displayName ?? "Unknown",
          email: userDirectory[membership.user_id as string]?.email ?? null,
        })),
      roomAccess: (roomMemberships ?? [])
        .filter((membership) => membership.group_id === group.id)
        .flatMap((membership) => {
          const room = roomById.get(membership.room_id as string);

          if (!room) {
            return [];
          }

          return [
            {
              roomId: room.id,
              roomName: room.name,
              roomSlug: room.slug,
              role: membership.role as "admin" | "member",
            },
          ];
        }),
    })),
  };
}

Deno.serve((req) =>
  withJsonHandler(req, async () => {
    const supabase = createAdminClient();
    const session = await requireActiveSession(req, supabase);

    if (req.method === "GET") {
      const organizationId = new URL(req.url).searchParams.get("organizationId")?.trim();

      if (!organizationId) {
        throw new HttpError(400, "bad_request", "organizationId is required.");
      }

      const organization = await requireOrganizationAccess(supabase, session.user, organizationId, "admin");
      const payload = await buildGroupViews(supabase, organizationId);

      return jsonResponse(req, {
        organization,
        ...payload,
      });
    }

    const body = (await req.json()) as SharingGroupBody;
    const organizationId = body.organizationId?.trim();

    if (!organizationId) {
      throw new HttpError(400, "bad_request", "organizationId is required.");
    }

    const organization = await requireOrganizationAccess(supabase, session.user, organizationId, "admin");
    const memberUserIds = Array.from(
      new Set(
        (body.memberUserIds ?? [])
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    );
    const roomAccess = normalizeRoomAccess(body.roomAccess);

    await Promise.all([
      assertOrganizationUserIds(supabase, organizationId, memberUserIds),
      assertOrganizationRoomIds(
        supabase,
        organizationId,
        roomAccess.map((entry) => entry.roomId),
      ),
    ]);

    if (req.method === "POST") {
      const name = normalizeRequiredName("Group name", body.name);
      const slug = normalizeSlug(body.slug, name);
      const description = normalizeOptionalText(body.description, 500);

      const { data: createdGroup, error: createdGroupError } = await supabase
        .from("sharing_groups")
        .insert({
          organization_id: organizationId,
          name,
          slug,
          description,
          created_by: session.userId,
        })
        .select("id")
        .single();

      if (createdGroupError || !createdGroup) {
        throw new HttpError(
          createdGroupError?.code === "23505" ? 409 : 500,
          createdGroupError?.code === "23505" ? "conflict" : "internal_error",
          createdGroupError?.code === "23505"
            ? "A sharing group with this slug already exists."
            : "Failed to create sharing group.",
          createdGroupError?.message,
        );
      }

      if (memberUserIds.length) {
        const { error: membershipsError } = await supabase.from("sharing_group_memberships").insert(
          memberUserIds.map((userId) => ({
            group_id: createdGroup.id as string,
            user_id: userId,
          })),
        );

        if (membershipsError) {
          throw new HttpError(500, "internal_error", "Failed to save group members.", membershipsError.message);
        }
      }

      if (roomAccess.length) {
        const { error: roomAccessError } = await supabase.from("room_group_memberships").insert(
          roomAccess.map((entry) => ({
            room_id: entry.roomId,
            group_id: createdGroup.id as string,
            role: entry.role,
          })),
        );

        if (roomAccessError) {
          throw new HttpError(500, "internal_error", "Failed to save room access.", roomAccessError.message);
        }
      }

      await writeAuditEvent(supabase, {
        actorUserId: session.userId,
        organizationId,
        action: "sharing_group.created",
        entityType: "sharing_group",
        entityId: createdGroup.id as string,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
        details: {
          memberCount: memberUserIds.length,
          roomAccessCount: roomAccess.length,
        },
      });

      const payload = await buildGroupViews(supabase, organizationId);
      const group = payload.groups.find((entry) => entry.id === createdGroup.id);

      return jsonResponse(req, {
        organization,
        group,
      });
    }

    if (req.method === "PATCH") {
      const groupId = body.groupId?.trim();

      if (!groupId) {
        throw new HttpError(400, "bad_request", "groupId is required.");
      }

      const { data: existingGroup, error: existingGroupError } = await supabase
        .from("sharing_groups")
        .select("id, name")
        .eq("id", groupId)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (existingGroupError) {
        throw new HttpError(500, "internal_error", "Failed to load sharing group.", existingGroupError.message);
      }

      if (!existingGroup) {
        throw new HttpError(404, "not_found", "Sharing group not found.");
      }

      const name = normalizeRequiredName("Group name", body.name ?? existingGroup.name);
      const slug = normalizeSlug(body.slug, name);
      const description = normalizeOptionalText(body.description, 500);

      const { error: updateGroupError } = await supabase
        .from("sharing_groups")
        .update({
          name,
          slug,
          description,
        })
        .eq("id", groupId)
        .eq("organization_id", organizationId);

      if (updateGroupError) {
        throw new HttpError(
          updateGroupError?.code === "23505" ? 409 : 500,
          updateGroupError?.code === "23505" ? "conflict" : "internal_error",
          updateGroupError?.code === "23505"
            ? "A sharing group with this slug already exists."
            : "Failed to update sharing group.",
          updateGroupError?.message,
        );
      }

      const { error: deleteMembersError } = await supabase
        .from("sharing_group_memberships")
        .delete()
        .eq("group_id", groupId);

      if (deleteMembersError) {
        throw new HttpError(500, "internal_error", "Failed to replace group members.", deleteMembersError.message);
      }

      if (memberUserIds.length) {
        const { error: insertMembersError } = await supabase.from("sharing_group_memberships").insert(
          memberUserIds.map((userId) => ({
            group_id: groupId,
            user_id: userId,
          })),
        );

        if (insertMembersError) {
          throw new HttpError(500, "internal_error", "Failed to save group members.", insertMembersError.message);
        }
      }

      const { error: deleteRoomAccessError } = await supabase
        .from("room_group_memberships")
        .delete()
        .eq("group_id", groupId);

      if (deleteRoomAccessError) {
        throw new HttpError(500, "internal_error", "Failed to replace room access.", deleteRoomAccessError.message);
      }

      if (roomAccess.length) {
        const { error: insertRoomAccessError } = await supabase.from("room_group_memberships").insert(
          roomAccess.map((entry) => ({
            room_id: entry.roomId,
            group_id: groupId,
            role: entry.role,
          })),
        );

        if (insertRoomAccessError) {
          throw new HttpError(500, "internal_error", "Failed to save room access.", insertRoomAccessError.message);
        }
      }

      await writeAuditEvent(supabase, {
        actorUserId: session.userId,
        organizationId,
        action: "sharing_group.updated",
        entityType: "sharing_group",
        entityId: groupId,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
        details: {
          memberCount: memberUserIds.length,
          roomAccessCount: roomAccess.length,
        },
      });

      const payload = await buildGroupViews(supabase, organizationId);
      const group = payload.groups.find((entry) => entry.id === groupId);

      return jsonResponse(req, {
        organization,
        group,
      });
    }

    throw new HttpError(405, "bad_request", "Unsupported method.");
  }),
);
