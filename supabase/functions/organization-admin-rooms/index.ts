import { writeAuditEvent } from "../_shared/audit.ts";
import { requireOrganizationAccess } from "../_shared/organizations.ts";
import {
  listOrganizationRoomsBasic,
  normalizeOptionalText,
  normalizePositiveInteger,
  normalizeRequiredName,
  normalizeSlug,
} from "../_shared/organization-admin.ts";
import { withJsonHandler, HttpError, jsonResponse } from "../_shared/http.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { getClientIp, getUserAgent, requireActiveSession } from "../_shared/sessions.ts";

type CreateRoomBody = {
  organizationId?: string;
  name?: string;
  slug?: string;
  description?: string | null;
  gridWidth?: number;
  gridHeight?: number;
};

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
      const rooms = await listOrganizationRoomsBasic(supabase, organizationId);
      const roomIds = rooms.map((room) => room.id);

      const [
        { data: desks, error: desksError },
        { data: zones, error: zonesError },
        { data: groupMemberships, error: groupMembershipsError },
        { data: userMemberships, error: userMembershipsError },
      ] = await Promise.all([
        roomIds.length
          ? supabase.from("room_desks").select("room_id, id").in("room_id", roomIds)
          : Promise.resolve({ data: [], error: null }),
        roomIds.length
          ? supabase.from("room_zones").select("room_id, id").in("room_id", roomIds)
          : Promise.resolve({ data: [], error: null }),
        roomIds.length
          ? supabase.from("room_group_memberships").select("room_id, id").in("room_id", roomIds)
          : Promise.resolve({ data: [], error: null }),
        roomIds.length
          ? supabase.from("room_memberships").select("room_id, role").in("room_id", roomIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (desksError || zonesError || groupMembershipsError || userMembershipsError) {
        throw new HttpError(
          500,
          "internal_error",
          "Failed to load room summaries.",
          desksError?.message ||
            zonesError?.message ||
            groupMembershipsError?.message ||
            userMembershipsError?.message,
        );
      }

      const deskCountByRoomId = new Map<string, number>();
      for (const desk of desks ?? []) {
        const roomId = desk.room_id as string;
        deskCountByRoomId.set(roomId, (deskCountByRoomId.get(roomId) ?? 0) + 1);
      }

      const zoneCountByRoomId = new Map<string, number>();
      for (const zone of zones ?? []) {
        const roomId = zone.room_id as string;
        zoneCountByRoomId.set(roomId, (zoneCountByRoomId.get(roomId) ?? 0) + 1);
      }

      const groupAccessCountByRoomId = new Map<string, number>();
      for (const membership of groupMemberships ?? []) {
        const roomId = membership.room_id as string;
        groupAccessCountByRoomId.set(roomId, (groupAccessCountByRoomId.get(roomId) ?? 0) + 1);
      }

      const adminCountByRoomId = new Map<string, number>();
      const memberCountByRoomId = new Map<string, number>();

      for (const membership of userMemberships ?? []) {
        const roomId = membership.room_id as string;
        if (membership.role === "admin") {
          adminCountByRoomId.set(roomId, (adminCountByRoomId.get(roomId) ?? 0) + 1);
        } else {
          memberCountByRoomId.set(roomId, (memberCountByRoomId.get(roomId) ?? 0) + 1);
        }
      }

      return jsonResponse(req, {
        organization,
        rooms: rooms.map((room) => ({
          ...room,
          deskCount: deskCountByRoomId.get(room.id) ?? 0,
          zoneCount: zoneCountByRoomId.get(room.id) ?? 0,
          groupAccessCount: groupAccessCountByRoomId.get(room.id) ?? 0,
          adminCount: adminCountByRoomId.get(room.id) ?? 0,
          memberCount: memberCountByRoomId.get(room.id) ?? 0,
        })),
      });
    }

    if (req.method === "POST") {
      const body = (await req.json()) as CreateRoomBody;
      const organizationId = body.organizationId?.trim();

      if (!organizationId) {
        throw new HttpError(400, "bad_request", "organizationId is required.");
      }

      const organization = await requireOrganizationAccess(supabase, session.user, organizationId, "admin");
      const name = normalizeRequiredName("Room name", body.name);
      const slug = normalizeSlug(body.slug, name);
      const description = normalizeOptionalText(body.description, 500);
      const gridWidth = normalizePositiveInteger("gridWidth", body.gridWidth ?? 24, 4, 64);
      const gridHeight = normalizePositiveInteger("gridHeight", body.gridHeight ?? 24, 4, 64);

      const { data: createdRoom, error: createdRoomError } = await supabase
        .from("rooms")
        .insert({
          organization_id: organizationId,
          name,
          slug,
          description,
          grid_width: gridWidth,
          grid_height: gridHeight,
          is_active: true,
          created_by: session.userId,
        })
        .select("id, name, slug, description, grid_width, grid_height, is_active, created_at, updated_at")
        .single();

      if (createdRoomError || !createdRoom) {
        throw new HttpError(
          createdRoomError?.code === "23505" ? 409 : 500,
          createdRoomError?.code === "23505" ? "conflict" : "internal_error",
          createdRoomError?.code === "23505"
            ? "A room with this slug already exists in the organization."
            : "Failed to create room.",
          createdRoomError?.message,
        );
      }

      if (session.user.role !== "super_admin") {
        const { error: membershipError } = await supabase.from("room_memberships").insert({
          room_id: createdRoom.id,
          user_id: session.userId,
          role: "admin",
          created_by: session.userId,
        });

        if (membershipError) {
          throw new HttpError(500, "internal_error", "Failed to assign room admin scope.", membershipError.message);
        }
      }

      await writeAuditEvent(supabase, {
        actorUserId: session.userId,
        organizationId,
        action: "room.created",
        entityType: "room",
        entityId: createdRoom.id as string,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
        details: {
          slug,
          gridWidth,
          gridHeight,
        },
      });

      return jsonResponse(req, {
        organization,
        room: {
          id: createdRoom.id,
          name: createdRoom.name,
          slug: createdRoom.slug,
          description: createdRoom.description,
          gridWidth: createdRoom.grid_width,
          gridHeight: createdRoom.grid_height,
          isActive: createdRoom.is_active,
          deskCount: 0,
          zoneCount: 0,
          groupAccessCount: 0,
          adminCount: session.user.role === "super_admin" ? 0 : 1,
          memberCount: 0,
          createdAt: createdRoom.created_at,
          updatedAt: createdRoom.updated_at,
        },
      });
    }

    throw new HttpError(405, "bad_request", "Unsupported method.");
  }),
);
