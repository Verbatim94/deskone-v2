import { writeAuditEvent } from "../_shared/audit.ts";
import { requireOrganizationAccess } from "../_shared/organizations.ts";
import {
  assertOrganizationGroupIds,
  assertOrganizationUserIds,
  ensureOrganizationAmenities,
  listOrganizationAmenities,
  listOrganizationGroupsBasic,
  listOrganizationMembers,
  normalizeOptionalText,
  normalizePositiveInteger,
  normalizeRequiredName,
  normalizeSlug,
} from "../_shared/organization-admin.ts";
import { withJsonHandler, HttpError, jsonResponse } from "../_shared/http.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { getClientIp, getUserAgent, requireActiveSession } from "../_shared/sessions.ts";

type LayoutDeskInput = {
  id?: string;
  label?: string | null;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotationDegrees?: number;
  zIndex?: number;
  defaultStatus?: "available" | "restricted";
  amenities?: string[];
};

type LayoutZoneInput = {
  id?: string;
  name?: string;
  zoneType?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: string | null;
};

type LayoutUserAccessInput = {
  userId?: string;
  role?: "admin" | "member";
};

type LayoutGroupAccessInput = {
  groupId?: string;
  role?: "admin" | "member";
};

type LayoutBody = {
  organizationId?: string;
  roomId?: string;
  room?: {
    name?: string;
    slug?: string;
    description?: string | null;
    gridWidth?: number;
    gridHeight?: number;
    isActive?: boolean;
  };
  desks?: LayoutDeskInput[];
  zones?: LayoutZoneInput[];
  roomUserAccess?: LayoutUserAccessInput[];
  roomGroupAccess?: LayoutGroupAccessInput[];
};

function normalizeRotationDegrees(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);

  if (!Number.isFinite(parsed) || parsed < -360 || parsed > 360) {
    throw new HttpError(400, "bad_request", "rotationDegrees must stay between -360 and 360.");
  }

  return parsed;
}

function normalizeDeskInputs(value: unknown) {
  if (!Array.isArray(value)) {
    throw new HttpError(400, "bad_request", "desks must be an array.");
  }

  const seenDeskIds = new Set<string>();

  return value.map((desk, index) => {
    if (!desk || typeof desk !== "object") {
      throw new HttpError(400, "bad_request", `Desk ${index + 1} is invalid.`);
    }

    const id = "id" in desk && typeof desk.id === "string" && desk.id.trim() ? desk.id.trim() : crypto.randomUUID();

    if (seenDeskIds.has(id)) {
      throw new HttpError(400, "bad_request", "Desk ids must be unique inside the payload.");
    }

    seenDeskIds.add(id);

    return {
      id,
      label: normalizeOptionalText("label" in desk ? desk.label : null, 32),
      x: normalizePositiveInteger(`desks[${index}].x`, "x" in desk ? desk.x : undefined, 0, 255),
      y: normalizePositiveInteger(`desks[${index}].y`, "y" in desk ? desk.y : undefined, 0, 255),
      width: normalizePositiveInteger(`desks[${index}].width`, "width" in desk ? desk.width : undefined, 1, 12),
      height: normalizePositiveInteger(`desks[${index}].height`, "height" in desk ? desk.height : undefined, 1, 12),
      rotationDegrees: normalizeRotationDegrees("rotationDegrees" in desk ? desk.rotationDegrees : 0),
      zIndex: normalizePositiveInteger(`desks[${index}].zIndex`, "zIndex" in desk ? desk.zIndex : 0, 0, 9999),
      defaultStatus:
        "defaultStatus" in desk && desk.defaultStatus === "restricted" ? "restricted" : "available",
      amenities: Array.from(
        new Set(
          (Array.isArray(desk.amenities) ? desk.amenities : [])
            .filter((amenity): amenity is string => typeof amenity === "string")
            .map((amenity) => amenity.trim())
            .filter(Boolean),
        ),
      ),
    };
  });
}

function normalizeZoneInputs(value: unknown) {
  if (!Array.isArray(value)) {
    throw new HttpError(400, "bad_request", "zones must be an array.");
  }

  const seenZoneIds = new Set<string>();

  return value.map((zone, index) => {
    if (!zone || typeof zone !== "object") {
      throw new HttpError(400, "bad_request", `Zone ${index + 1} is invalid.`);
    }

    const id = "id" in zone && typeof zone.id === "string" && zone.id.trim() ? zone.id.trim() : crypto.randomUUID();

    if (seenZoneIds.has(id)) {
      throw new HttpError(400, "bad_request", "Zone ids must be unique inside the payload.");
    }

    seenZoneIds.add(id);

    return {
      id,
      name: normalizeRequiredName("Zone name", "name" in zone ? zone.name : undefined, 120),
      zoneType: normalizeRequiredName("Zone type", "zoneType" in zone ? zone.zoneType : undefined, 60),
      x: normalizePositiveInteger(`zones[${index}].x`, "x" in zone ? zone.x : undefined, 0, 512),
      y: normalizePositiveInteger(`zones[${index}].y`, "y" in zone ? zone.y : undefined, 0, 512),
      width: normalizePositiveInteger(`zones[${index}].width`, "width" in zone ? zone.width : undefined, 1, 512),
      height: normalizePositiveInteger(`zones[${index}].height`, "height" in zone ? zone.height : undefined, 1, 512),
      color: normalizeOptionalText("color" in zone ? zone.color : null, 40),
    };
  });
}

function normalizeRoomUserAccess(value: unknown) {
  if (!Array.isArray(value)) {
    throw new HttpError(400, "bad_request", "roomUserAccess must be an array.");
  }

  const byUserId = new Map<string, "admin" | "member">();

  for (const access of value) {
    if (!access || typeof access !== "object") {
      throw new HttpError(400, "bad_request", "Each room user access entry must be an object.");
    }

    const userId = "userId" in access && typeof access.userId === "string" ? access.userId.trim() : "";
    const role = "role" in access && access.role === "admin" ? "admin" : "member";

    if (!userId) {
      throw new HttpError(400, "bad_request", "Each room user access entry requires userId.");
    }

    const existingRole = byUserId.get(userId);
    byUserId.set(userId, existingRole === "admin" || role === "admin" ? "admin" : "member");
  }

  return Array.from(byUserId.entries()).map(([userId, role]) => ({
    userId,
    role,
  }));
}

function normalizeRoomGroupAccess(value: unknown) {
  if (!Array.isArray(value)) {
    throw new HttpError(400, "bad_request", "roomGroupAccess must be an array.");
  }

  const byGroupId = new Map<string, "admin" | "member">();

  for (const access of value) {
    if (!access || typeof access !== "object") {
      throw new HttpError(400, "bad_request", "Each room group access entry must be an object.");
    }

    const groupId = "groupId" in access && typeof access.groupId === "string" ? access.groupId.trim() : "";
    const role = "role" in access && access.role === "admin" ? "admin" : "member";

    if (!groupId) {
      throw new HttpError(400, "bad_request", "Each room group access entry requires groupId.");
    }

    const existingRole = byGroupId.get(groupId);
    byGroupId.set(groupId, existingRole === "admin" || role === "admin" ? "admin" : "member");
  }

  return Array.from(byGroupId.entries()).map(([groupId, role]) => ({
    groupId,
    role,
  }));
}

async function loadRoomLayoutView(
  supabase: ReturnType<typeof createAdminClient>,
  organizationId: string,
  roomId: string,
) {
  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id, name, slug, description, grid_width, grid_height, is_active, updated_at")
    .eq("organization_id", organizationId)
    .eq("id", roomId)
    .maybeSingle();

  if (roomError) {
    throw new HttpError(500, "internal_error", "Failed to load room.", roomError.message);
  }

  if (!room) {
    throw new HttpError(404, "not_found", "Room not found.");
  }

  const [
    organizationMembers,
    organizationGroups,
    amenityCatalog,
    { data: desks, error: desksError },
    { data: zones, error: zonesError },
    { data: walls, error: wallsError },
    { data: roomMemberships, error: roomMembershipsError },
    { data: roomGroupMemberships, error: roomGroupMembershipsError },
  ] = await Promise.all([
    listOrganizationMembers(supabase, organizationId),
    listOrganizationGroupsBasic(supabase, organizationId),
    listOrganizationAmenities(supabase, organizationId),
    supabase
      .from("room_desks")
      .select("id, label, x, y, width, height, rotation_degrees, z_index, default_status")
      .eq("room_id", roomId)
      .order("z_index", { ascending: true })
      .order("label", { ascending: true }),
    supabase
      .from("room_zones")
      .select("id, name, zone_type, x, y, width, height, color")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true }),
    supabase
      .from("room_walls")
      .select("id, start_row, start_col, end_row, end_col, orientation, type")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true }),
    supabase
      .from("room_memberships")
      .select("user_id, role")
      .eq("room_id", roomId),
    supabase
      .from("room_group_memberships")
      .select("group_id, role")
      .eq("room_id", roomId),
  ]);

  if (desksError || zonesError || wallsError || roomMembershipsError || roomGroupMembershipsError) {
    throw new HttpError(
      500,
      "internal_error",
      "Failed to load room layout.",
      desksError?.message ||
        zonesError?.message ||
        wallsError?.message ||
        roomMembershipsError?.message ||
        roomGroupMembershipsError?.message,
    );
  }

  const deskIds = (desks ?? []).map((desk) => desk.id as string);
  const { data: deskAmenities, error: deskAmenitiesError } = deskIds.length
    ? await supabase
        .from("desk_amenities")
        .select("desk_id, amenity:amenities!inner (name)")
        .in("desk_id", deskIds)
    : { data: [], error: null };

  if (deskAmenitiesError) {
    throw new HttpError(500, "internal_error", "Failed to load desk amenities.", deskAmenitiesError.message);
  }

  const amenityNamesByDeskId = new Map<string, string[]>();
  for (const row of deskAmenities ?? []) {
    const deskAmenityNames = amenityNamesByDeskId.get(row.desk_id as string) ?? [];
    deskAmenityNames.push(row.amenity?.name as string);
    amenityNamesByDeskId.set(row.desk_id as string, deskAmenityNames);
  }

  const memberById = new Map(organizationMembers.map((member) => [member.userId, member]));
  const groupById = new Map(organizationGroups.map((group) => [group.id, group]));

  return {
    room: {
      id: room.id as string,
      name: room.name as string,
      slug: room.slug as string,
      description: (room.description as string | null | undefined) ?? null,
      gridWidth: room.grid_width as number,
      gridHeight: room.grid_height as number,
      isActive: room.is_active as boolean,
      updatedAt: room.updated_at as string,
    },
    desks: (desks ?? []).map((desk) => ({
      id: desk.id as string,
      label: (desk.label as string | null | undefined) ?? null,
      x: desk.x as number,
      y: desk.y as number,
      width: desk.width as number,
      height: desk.height as number,
      rotationDegrees: Number(desk.rotation_degrees ?? 0),
      zIndex: desk.z_index as number,
      defaultStatus: desk.default_status as "available" | "restricted",
      amenities: amenityNamesByDeskId.get(desk.id as string) ?? [],
    })),
    zones: (zones ?? []).map((zone) => ({
      id: zone.id as string,
      name: zone.name as string,
      zoneType: zone.zone_type as string,
      x: zone.x as number,
      y: zone.y as number,
      width: zone.width as number,
      height: zone.height as number,
      color: (zone.color as string | null | undefined) ?? null,
    })),
    walls: (walls ?? []).map((wall) => ({
      id: wall.id as string,
      startRow: wall.start_row as number,
      startCol: wall.start_col as number,
      endRow: wall.end_row as number,
      endCol: wall.end_col as number,
      orientation: wall.orientation as "horizontal" | "vertical",
      type: wall.type as "wall" | "entrance",
    })),
    roomUserAccess: (roomMemberships ?? []).flatMap((membership) => {
      const member = memberById.get(membership.user_id as string);

      if (!member) {
        return [];
      }

      return [
        {
          userId: member.userId,
          username: member.username,
          displayName: member.displayName,
          email: member.email,
          role: membership.role as "admin" | "member",
        },
      ];
    }),
    roomGroupAccess: (roomGroupMemberships ?? []).flatMap((membership) => {
      const group = groupById.get(membership.group_id as string);

      if (!group) {
        return [];
      }

      return [
        {
          groupId: group.id,
          groupName: group.name,
          groupSlug: group.slug,
          role: membership.role as "admin" | "member",
        },
      ];
    }),
    organizationMembers,
    organizationGroups,
    amenityCatalog,
  };
}

Deno.serve((req) =>
  withJsonHandler(req, async () => {
    const supabase = createAdminClient();
    const session = await requireActiveSession(req, supabase);

    if (req.method === "GET") {
      const url = new URL(req.url);
      const organizationId = url.searchParams.get("organizationId")?.trim();
      const roomId = url.searchParams.get("roomId")?.trim();

      if (!organizationId || !roomId) {
        throw new HttpError(400, "bad_request", "organizationId and roomId are required.");
      }

      const organization = await requireOrganizationAccess(supabase, session.user, organizationId, "admin");
      const payload = await loadRoomLayoutView(supabase, organizationId, roomId);

      return jsonResponse(req, {
        organization,
        ...payload,
      });
    }

    if (req.method === "PUT") {
      const body = (await req.json()) as LayoutBody;
      const organizationId = body.organizationId?.trim();
      const roomId = body.roomId?.trim();

      if (!organizationId || !roomId) {
        throw new HttpError(400, "bad_request", "organizationId and roomId are required.");
      }

      const organization = await requireOrganizationAccess(supabase, session.user, organizationId, "admin");
      const { room } = body;

      if (!room || typeof room !== "object") {
        throw new HttpError(400, "bad_request", "room payload is required.");
      }

      const normalizedRoom = {
        name: normalizeRequiredName("Room name", room.name),
        slug: normalizeSlug(room.slug, room.name),
        description: normalizeOptionalText(room.description, 500),
        gridWidth: normalizePositiveInteger("gridWidth", room.gridWidth, 4, 64),
        gridHeight: normalizePositiveInteger("gridHeight", room.gridHeight, 4, 64),
        isActive: typeof room.isActive === "boolean" ? room.isActive : true,
      };

      const desks = normalizeDeskInputs(body.desks);
      const zones = normalizeZoneInputs(body.zones);
      const roomUserAccess = normalizeRoomUserAccess(body.roomUserAccess);
      const roomGroupAccess = normalizeRoomGroupAccess(body.roomGroupAccess);

      await Promise.all([
        assertOrganizationUserIds(
          supabase,
          organizationId,
          roomUserAccess.map((entry) => entry.userId),
        ),
        assertOrganizationGroupIds(
          supabase,
          organizationId,
          roomGroupAccess.map((entry) => entry.groupId),
        ),
      ]);

      const { data: roomRecord, error: roomRecordError } = await supabase
        .from("rooms")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("id", roomId)
        .maybeSingle();

      if (roomRecordError) {
        throw new HttpError(500, "internal_error", "Failed to verify room.", roomRecordError.message);
      }

      if (!roomRecord) {
        throw new HttpError(404, "not_found", "Room not found.");
      }

      const incomingDeskIds = desks.map((desk) => desk.id);
      const incomingZoneIds = zones.map((zone) => zone.id);

      const [
        { data: existingDesks, error: existingDesksError },
        { data: collidingDesks, error: collidingDesksError },
        { data: existingZones, error: existingZonesError },
        { data: collidingZones, error: collidingZonesError },
      ] = await Promise.all([
        supabase.from("room_desks").select("id").eq("room_id", roomId),
        incomingDeskIds.length
          ? supabase.from("room_desks").select("id, room_id").in("id", incomingDeskIds)
          : Promise.resolve({ data: [], error: null }),
        supabase.from("room_zones").select("id").eq("room_id", roomId),
        incomingZoneIds.length
          ? supabase.from("room_zones").select("id, room_id").in("id", incomingZoneIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (existingDesksError || collidingDesksError || existingZonesError || collidingZonesError) {
        throw new HttpError(
          500,
          "internal_error",
          "Failed to validate room layout payload.",
          existingDesksError?.message ||
            collidingDesksError?.message ||
            existingZonesError?.message ||
            collidingZonesError?.message,
        );
      }

      const invalidDeskIds = (collidingDesks ?? [])
        .filter((desk) => desk.room_id !== roomId)
        .map((desk) => desk.id as string);

      if (invalidDeskIds.length) {
        throw new HttpError(400, "bad_request", "Some desk ids belong to another room.", { invalidDeskIds });
      }

      const invalidZoneIds = (collidingZones ?? [])
        .filter((zone) => zone.room_id !== roomId)
        .map((zone) => zone.id as string);

      if (invalidZoneIds.length) {
        throw new HttpError(400, "bad_request", "Some zone ids belong to another room.", { invalidZoneIds });
      }

      const existingDeskIds = (existingDesks ?? []).map((desk) => desk.id as string);
      const removedDeskIds = existingDeskIds.filter((deskId) => !incomingDeskIds.includes(deskId));
      const existingZoneIds = (existingZones ?? []).map((zone) => zone.id as string);
      const removedZoneIds = existingZoneIds.filter((zoneId) => !incomingZoneIds.includes(zoneId));

      if (removedDeskIds.length) {
        const [{ data: reservationDependencies, error: reservationDependenciesError }, { data: assignmentDependencies, error: assignmentDependenciesError }] =
          await Promise.all([
            supabase
              .from("reservations")
              .select("id, desk_id")
              .in("desk_id", removedDeskIds)
              .limit(10),
            supabase
              .from("desk_assignments")
              .select("id, desk_id")
              .in("desk_id", removedDeskIds)
              .limit(10),
          ]);

        if (reservationDependenciesError || assignmentDependenciesError) {
          throw new HttpError(
            500,
            "internal_error",
            "Failed to validate desk dependencies.",
            reservationDependenciesError?.message || assignmentDependenciesError?.message,
          );
        }

        if ((reservationDependencies?.length ?? 0) > 0 || (assignmentDependencies?.length ?? 0) > 0) {
          throw new HttpError(
            409,
            "conflict",
            "Some desks cannot be removed because bookings or assignments already exist for them.",
          );
        }
      }

      const amenityIdByName = await ensureOrganizationAmenities(
        supabase,
        organizationId,
        desks.flatMap((desk) => desk.amenities),
      );

      const { error: updateRoomError } = await supabase
        .from("rooms")
        .update({
          name: normalizedRoom.name,
          slug: normalizedRoom.slug,
          description: normalizedRoom.description,
          grid_width: normalizedRoom.gridWidth,
          grid_height: normalizedRoom.gridHeight,
          is_active: normalizedRoom.isActive,
        })
        .eq("id", roomId)
        .eq("organization_id", organizationId);

      if (updateRoomError) {
        throw new HttpError(
          updateRoomError.code === "23505" ? 409 : 500,
          updateRoomError.code === "23505" ? "conflict" : "internal_error",
          updateRoomError.code === "23505"
            ? "A room with this slug already exists in the organization."
            : "Failed to update room.",
          updateRoomError.message,
        );
      }

      if (desks.length) {
        const { error: upsertDesksError } = await supabase.from("room_desks").upsert(
          desks.map((desk) => ({
            id: desk.id,
            room_id: roomId,
            label: desk.label,
            x: desk.x,
            y: desk.y,
            width: desk.width,
            height: desk.height,
            rotation_degrees: desk.rotationDegrees,
            z_index: desk.zIndex,
            default_status: desk.defaultStatus,
          })),
        );

        if (upsertDesksError) {
          throw new HttpError(500, "internal_error", "Failed to save desks.", upsertDesksError.message);
        }

        const { error: clearDeskAmenitiesError } = await supabase
          .from("desk_amenities")
          .delete()
          .in("desk_id", incomingDeskIds);

        if (clearDeskAmenitiesError) {
          throw new HttpError(500, "internal_error", "Failed to refresh desk amenities.", clearDeskAmenitiesError.message);
        }

        const deskAmenityRows = desks.flatMap((desk) =>
          desk.amenities.map((amenityName) => ({
            desk_id: desk.id,
            amenity_id: amenityIdByName.get(amenityName)!,
          })),
        );

        if (deskAmenityRows.length) {
          const { error: insertDeskAmenitiesError } = await supabase.from("desk_amenities").insert(deskAmenityRows);

          if (insertDeskAmenitiesError) {
            throw new HttpError(
              500,
              "internal_error",
              "Failed to save desk amenities.",
              insertDeskAmenitiesError.message,
            );
          }
        }
      } else {
        const existingAllDeskIds = (existingDesks ?? []).map((desk) => desk.id as string);

        if (existingAllDeskIds.length) {
          const { error: clearDeskAmenitiesError } = await supabase
            .from("desk_amenities")
            .delete()
            .in("desk_id", existingAllDeskIds);

          if (clearDeskAmenitiesError) {
            throw new HttpError(500, "internal_error", "Failed to clear desk amenities.", clearDeskAmenitiesError.message);
          }
        }
      }

      if (removedDeskIds.length) {
        const { error: deleteRemovedDesksError } = await supabase
          .from("room_desks")
          .delete()
          .in("id", removedDeskIds);

        if (deleteRemovedDesksError) {
          throw new HttpError(500, "internal_error", "Failed to remove deleted desks.", deleteRemovedDesksError.message);
        }
      }

      if (zones.length) {
        const { error: upsertZonesError } = await supabase.from("room_zones").upsert(
          zones.map((zone) => ({
            id: zone.id,
            room_id: roomId,
            name: zone.name,
            zone_type: zone.zoneType,
            x: zone.x,
            y: zone.y,
            width: zone.width,
            height: zone.height,
            color: zone.color,
          })),
        );

        if (upsertZonesError) {
          throw new HttpError(500, "internal_error", "Failed to save room zones.", upsertZonesError.message);
        }
      }

      if (removedZoneIds.length) {
        const { error: deleteRemovedZonesError } = await supabase
          .from("room_zones")
          .delete()
          .in("id", removedZoneIds);

        if (deleteRemovedZonesError) {
          throw new HttpError(500, "internal_error", "Failed to remove deleted zones.", deleteRemovedZonesError.message);
        }
      }

      const { error: clearRoomMembershipsError } = await supabase
        .from("room_memberships")
        .delete()
        .eq("room_id", roomId);

      if (clearRoomMembershipsError) {
        throw new HttpError(500, "internal_error", "Failed to replace room user access.", clearRoomMembershipsError.message);
      }

      if (roomUserAccess.length) {
        const { error: insertRoomMembershipsError } = await supabase.from("room_memberships").insert(
          roomUserAccess.map((entry) => ({
            room_id: roomId,
            user_id: entry.userId,
            role: entry.role,
            created_by: session.userId,
          })),
        );

        if (insertRoomMembershipsError) {
          throw new HttpError(500, "internal_error", "Failed to save room user access.", insertRoomMembershipsError.message);
        }
      }

      const { error: clearRoomGroupAccessError } = await supabase
        .from("room_group_memberships")
        .delete()
        .eq("room_id", roomId);

      if (clearRoomGroupAccessError) {
        throw new HttpError(500, "internal_error", "Failed to replace room group access.", clearRoomGroupAccessError.message);
      }

      if (roomGroupAccess.length) {
        const { error: insertRoomGroupAccessError } = await supabase.from("room_group_memberships").insert(
          roomGroupAccess.map((entry) => ({
            room_id: roomId,
            group_id: entry.groupId,
            role: entry.role,
          })),
        );

        if (insertRoomGroupAccessError) {
          throw new HttpError(500, "internal_error", "Failed to save room group access.", insertRoomGroupAccessError.message);
        }
      }

      await writeAuditEvent(supabase, {
        actorUserId: session.userId,
        organizationId,
        action: "room.layout.updated",
        entityType: "room",
        entityId: roomId,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
        details: {
          deskCount: desks.length,
          zoneCount: zones.length,
          userAccessCount: roomUserAccess.length,
          groupAccessCount: roomGroupAccess.length,
        },
      });

      const payload = await loadRoomLayoutView(supabase, organizationId, roomId);

      return jsonResponse(req, {
        organization,
        ...payload,
      });
    }

    throw new HttpError(405, "bad_request", "Unsupported method.");
  }),
);
