import { requireOrganizationAccess } from "../_shared/organizations.ts";
import {
  normalizeDateOnly,
  normalizeTimeSegment,
  overlapsSegment,
  requireRoomScope,
} from "../_shared/rooms.ts";
import { withJsonHandler, HttpError, jsonResponse } from "../_shared/http.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { requireActiveSession } from "../_shared/sessions.ts";

type DeskStatus = "available" | "reserved" | "yours" | "restricted";

Deno.serve((req) =>
  withJsonHandler(req, async () => {
    if (req.method !== "GET") {
      throw new HttpError(405, "bad_request", "Unsupported method.");
    }

    const url = new URL(req.url);
    const organizationId = url.searchParams.get("organizationId")?.trim();
    const roomId = url.searchParams.get("roomId")?.trim();
    const date = normalizeDateOnly("date", url.searchParams.get("date"));
    const segment = normalizeTimeSegment(url.searchParams.get("segment"));

    if (!organizationId || !roomId) {
      throw new HttpError(400, "bad_request", "organizationId and roomId are required.");
    }

    const supabase = createAdminClient();
    const session = await requireActiveSession(req, supabase);
    const organization = await requireOrganizationAccess(supabase, session.user, organizationId, "member");
    const roomScope = await requireRoomScope(supabase, organization, session.user, roomId);

    const [
      { data: room, error: roomError },
      { data: desks, error: desksError },
      { data: zones, error: zonesError },
      { data: reservations, error: reservationsError },
      { data: assignments, error: assignmentsError },
    ] = await Promise.all([
      supabase
        .from("rooms")
        .select("id, name, slug, description, grid_width, grid_height, is_active, updated_at")
        .eq("organization_id", organizationId)
        .eq("id", roomId)
        .eq("is_active", true)
        .maybeSingle(),
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
        .from("reservations")
        .select(
          "id, desk_id, user_id, time_segment, status, date_start, date_end, notes, created_at, bookedBy:app_users!reservations_user_id_fkey(full_name)",
        )
        .eq("room_id", roomId)
        .lte("date_start", date)
        .gte("date_end", date)
        .in("status", ["pending", "approved"]),
      supabase
        .from("desk_assignments")
        .select("id, desk_id, user_id, date_start, date_end, assignedTo:app_users!desk_assignments_user_id_fkey(full_name)")
        .eq("room_id", roomId)
        .lte("date_start", date)
        .gte("date_end", date),
    ]);

    if (roomError || desksError || zonesError || reservationsError || assignmentsError) {
      throw new HttpError(
        500,
        "internal_error",
        "Failed to load room availability.",
        roomError?.message ||
          desksError?.message ||
          zonesError?.message ||
          reservationsError?.message ||
          assignmentsError?.message,
      );
    }

    if (!room) {
      throw new HttpError(404, "not_found", "Room not found.");
    }

    const assignmentIds = (assignments ?? []).map((assignment) => assignment.id as string);
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

    const { data: assignmentExceptions, error: assignmentExceptionsError } = assignmentIds.length
      ? await supabase
          .from("desk_assignment_exceptions")
          .select("assignment_id, exception_date")
          .in("assignment_id", assignmentIds)
          .eq("exception_date", date)
      : { data: [], error: null };

    if (assignmentExceptionsError) {
      throw new HttpError(500, "internal_error", "Failed to load assignment exceptions.", assignmentExceptionsError.message);
    }

    const amenityNamesByDeskId = new Map<string, string[]>();

    for (const row of deskAmenities ?? []) {
      const deskId = row.desk_id as string;
      if (!deskIds.includes(deskId)) {
        continue;
      }

      const names = amenityNamesByDeskId.get(deskId) ?? [];
      names.push(row.amenity?.name as string);
      amenityNamesByDeskId.set(deskId, names);
    }

    const skippedAssignmentIds = new Set((assignmentExceptions ?? []).map((entry) => entry.assignment_id as string));
    const activeAssignments = (assignments ?? []).filter(
      (assignment) => !skippedAssignmentIds.has(assignment.id as string),
    );

    const assignmentByDeskId = new Map<string, (typeof activeAssignments)[number]>();
    for (const assignment of activeAssignments) {
      assignmentByDeskId.set(assignment.desk_id as string, assignment);
    }

    const reservationsByDeskId = new Map<string, (typeof reservations)>();
    for (const reservation of reservations ?? []) {
      if (!overlapsSegment(segment, reservation.time_segment as "full" | "am" | "pm")) {
        continue;
      }

      const deskReservations = reservationsByDeskId.get(reservation.desk_id as string) ?? [];
      deskReservations.push(reservation);
      reservationsByDeskId.set(reservation.desk_id as string, deskReservations);
    }

    let currentUserReservation: {
      id: string;
      deskId: string;
      deskLabel: string | null;
      roomId: string;
      roomName: string;
      segment: "full" | "am" | "pm";
      status: "pending" | "approved";
      dateStart: string;
      dateEnd: string;
      notes: string | null;
    } | null = null;

    const serializedDesks = (desks ?? []).map((desk) => {
      const assignment = assignmentByDeskId.get(desk.id as string);
      const deskReservations = reservationsByDeskId.get(desk.id as string) ?? [];
      const ownReservation =
        deskReservations.find((reservation) => reservation.user_id === session.userId) ?? null;
      const foreignReservation =
        deskReservations.find((reservation) => reservation.user_id !== session.userId) ?? null;

      let status: DeskStatus = desk.default_status === "restricted" ? "restricted" : "available";
      let occupantLabel: string | null = null;
      let reservationId: string | null = null;
      let reservationSegment: "full" | "am" | "pm" | null = null;

      if (assignment) {
        if ((assignment.user_id as string) === session.userId) {
          status = "yours";
          occupantLabel = session.user.fullName;
        } else {
          status = "reserved";
          occupantLabel = assignment.assignedTo?.full_name as string;
        }
      } else if (ownReservation) {
        status = "yours";
        occupantLabel = session.user.fullName;
        reservationId = ownReservation.id as string;
        reservationSegment = ownReservation.time_segment as "full" | "am" | "pm";
        currentUserReservation = {
          id: ownReservation.id as string,
          deskId: desk.id as string,
          deskLabel: (desk.label as string | null | undefined) ?? null,
          roomId: room.id as string,
          roomName: room.name as string,
          segment: ownReservation.time_segment as "full" | "am" | "pm",
          status: ownReservation.status as "pending" | "approved",
          dateStart: ownReservation.date_start as string,
          dateEnd: ownReservation.date_end as string,
          notes: (ownReservation.notes as string | null | undefined) ?? null,
        };
      } else if (foreignReservation) {
        status = "reserved";
        occupantLabel = foreignReservation.bookedBy?.full_name as string;
        reservationId = foreignReservation.id as string;
        reservationSegment = foreignReservation.time_segment as "full" | "am" | "pm";
      }

      return {
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
        status,
        occupantLabel,
        reservationId,
        reservationSegment,
      };
    });

    return jsonResponse(req, {
      organization,
      roomScope,
      date,
      segment,
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
      summary: {
        totalDesks: serializedDesks.length,
        availableDesks: serializedDesks.filter((desk) => desk.status === "available").length,
        reservedDesks: serializedDesks.filter((desk) => desk.status === "reserved").length,
        restrictedDesks: serializedDesks.filter((desk) => desk.status === "restricted").length,
        yourDesks: serializedDesks.filter((desk) => desk.status === "yours").length,
      },
      currentUserReservation,
      desks: serializedDesks,
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
    });
  }),
);
