import { requireOrganizationAccess } from "../_shared/organizations.ts";
import { listAccessibleRoomScopes } from "../_shared/rooms.ts";
import { withJsonHandler, HttpError, jsonResponse } from "../_shared/http.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { requireActiveSession } from "../_shared/sessions.ts";

Deno.serve((req) =>
  withJsonHandler(req, async () => {
    if (req.method !== "GET") {
      throw new HttpError(405, "bad_request", "Unsupported method.");
    }

    const url = new URL(req.url);
    const organizationId = url.searchParams.get("organizationId")?.trim();

    if (!organizationId) {
      throw new HttpError(400, "bad_request", "organizationId is required.");
    }

    const supabase = createAdminClient();
    const session = await requireActiveSession(req, supabase);
    const organization = await requireOrganizationAccess(supabase, session.user, organizationId, "member");
    const roomScopes = await listAccessibleRoomScopes(supabase, organization, session.user);
    const roomIds = roomScopes.map((roomScope) => roomScope.roomId);

    if (!roomIds.length) {
      return jsonResponse(req, {
        organization,
        rooms: [],
      });
    }

    const [
      { data: rooms, error: roomsError },
      { data: desks, error: desksError },
      { data: zones, error: zonesError },
      { data: groupMemberships, error: groupMembershipsError },
    ] = await Promise.all([
      supabase
        .from("rooms")
        .select("id, name, slug, description, grid_width, grid_height, is_active, created_at, updated_at")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .in("id", roomIds)
        .order("name", { ascending: true }),
      supabase.from("room_desks").select("room_id, id").in("room_id", roomIds),
      supabase.from("room_zones").select("room_id, id").in("room_id", roomIds),
      supabase.from("room_group_memberships").select("room_id, id").in("room_id", roomIds),
    ]);

    if (roomsError || desksError || zonesError || groupMembershipsError) {
      throw new HttpError(
        500,
        "internal_error",
        "Failed to load accessible rooms.",
        roomsError?.message || desksError?.message || zonesError?.message || groupMembershipsError?.message,
      );
    }

    const accessRoleByRoomId = new Map(roomScopes.map((scope) => [scope.roomId, scope.accessRole]));
    const deskCountByRoomId = new Map<string, number>();
    const zoneCountByRoomId = new Map<string, number>();
    const groupAccessCountByRoomId = new Map<string, number>();

    for (const desk of desks ?? []) {
      const roomId = desk.room_id as string;
      deskCountByRoomId.set(roomId, (deskCountByRoomId.get(roomId) ?? 0) + 1);
    }

    for (const zone of zones ?? []) {
      const roomId = zone.room_id as string;
      zoneCountByRoomId.set(roomId, (zoneCountByRoomId.get(roomId) ?? 0) + 1);
    }

    for (const membership of groupMemberships ?? []) {
      const roomId = membership.room_id as string;
      groupAccessCountByRoomId.set(roomId, (groupAccessCountByRoomId.get(roomId) ?? 0) + 1);
    }

    return jsonResponse(req, {
      organization,
      rooms: (rooms ?? []).map((room) => ({
        id: room.id as string,
        name: room.name as string,
        slug: room.slug as string,
        description: (room.description as string | null | undefined) ?? null,
        gridWidth: room.grid_width as number,
        gridHeight: room.grid_height as number,
        isActive: room.is_active as boolean,
        deskCount: deskCountByRoomId.get(room.id as string) ?? 0,
        zoneCount: zoneCountByRoomId.get(room.id as string) ?? 0,
        groupAccessCount: groupAccessCountByRoomId.get(room.id as string) ?? 0,
        accessRole: accessRoleByRoomId.get(room.id as string) ?? "member",
        createdAt: room.created_at as string,
        updatedAt: room.updated_at as string,
      })),
    });
  }),
);
