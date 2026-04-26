import { writeAuditEvent } from "../_shared/audit.ts";
import { withJsonHandler, HttpError, jsonResponse } from "../_shared/http.ts";
import { requireOrganizationAccess } from "../_shared/organizations.ts";
import {
  normalizeDateOnly,
  normalizeTimeSegment,
  overlapsSegment,
  requireRoomScope,
} from "../_shared/rooms.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { getClientIp, getUserAgent, requireActiveSession } from "../_shared/sessions.ts";

type CreateReservationBody = {
  organizationId?: string;
  roomId?: string;
  deskId?: string;
  date?: string;
  segment?: "full" | "am" | "pm";
  notes?: string | null;
};

type CancelReservationBody = {
  organizationId?: string;
  reservationId?: string;
};

function normalizeOptionalNotes(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length > 500) {
    throw new HttpError(400, "bad_request", "Notes cannot exceed 500 characters.");
  }

  return normalized;
}

Deno.serve((req) =>
  withJsonHandler(req, async () => {
    const supabase = createAdminClient();
    const session = await requireActiveSession(req, supabase);

    if (req.method === "POST") {
      const body = (await req.json()) as CreateReservationBody;
      const organizationId = body.organizationId?.trim();
      const roomId = body.roomId?.trim();
      const deskId = body.deskId?.trim();
      const date = normalizeDateOnly("date", body.date);
      const segment = normalizeTimeSegment(body.segment);
      const notes = normalizeOptionalNotes(body.notes);

      if (!organizationId || !roomId || !deskId) {
        throw new HttpError(400, "bad_request", "organizationId, roomId and deskId are required.");
      }

      const organization = await requireOrganizationAccess(supabase, session.user, organizationId, "member");
      await requireRoomScope(supabase, organization, session.user, roomId);

      const { data: roomDesk, error: roomDeskError } = await supabase
        .from("room_desks")
        .select("id, room_id, label, default_status, room:rooms!inner(id, name, organization_id, is_active)")
        .eq("id", deskId)
        .maybeSingle();

      if (roomDeskError) {
        throw new HttpError(500, "internal_error", "Failed to verify desk.", roomDeskError.message);
      }

      if (
        !roomDesk ||
        roomDesk.room_id !== roomId ||
        roomDesk.room?.organization_id !== organizationId ||
        roomDesk.room?.is_active !== true
      ) {
        throw new HttpError(404, "not_found", "Desk not found.");
      }

      if (roomDesk.default_status === "restricted") {
        throw new HttpError(409, "conflict", "This desk is restricted and cannot be booked.");
      }

      const [{ data: deskReservations, error: deskReservationsError }, { data: userReservations, error: userReservationsError }, { data: assignments, error: assignmentsError }] =
        await Promise.all([
          supabase
            .from("reservations")
            .select("id, user_id, desk_id, time_segment, status")
            .eq("desk_id", deskId)
            .lte("date_start", date)
            .gte("date_end", date)
            .in("status", ["pending", "approved"]),
          supabase
            .from("reservations")
            .select("id, desk_id, room_id, time_segment, status")
            .eq("user_id", session.userId)
            .eq("room_id", roomId)
            .lte("date_start", date)
            .gte("date_end", date)
            .in("status", ["pending", "approved"]),
          supabase
            .from("desk_assignments")
            .select("id, desk_id, user_id")
            .eq("room_id", roomId)
            .lte("date_start", date)
            .gte("date_end", date),
        ]);

      if (deskReservationsError || userReservationsError || assignmentsError) {
        throw new HttpError(
          500,
          "internal_error",
          "Failed to validate reservation conflicts.",
          deskReservationsError?.message || userReservationsError?.message || assignmentsError?.message,
        );
      }

      const assignmentIds = (assignments ?? []).map((assignment) => assignment.id as string);
      const { data: assignmentExceptions, error: assignmentExceptionsError } = assignmentIds.length
        ? await supabase
            .from("desk_assignment_exceptions")
            .select("assignment_id")
            .in("assignment_id", assignmentIds)
            .eq("exception_date", date)
        : { data: [], error: null };

      if (assignmentExceptionsError) {
        throw new HttpError(500, "internal_error", "Failed to validate desk assignments.", assignmentExceptionsError.message);
      }

      const skippedAssignmentIds = new Set((assignmentExceptions ?? []).map((entry) => entry.assignment_id as string));
      const activeAssignments = (assignments ?? []).filter(
        (assignment) => !skippedAssignmentIds.has(assignment.id as string),
      );

      const deskAssignment = activeAssignments.find((assignment) => assignment.desk_id === deskId) ?? null;
      if (deskAssignment) {
        if ((deskAssignment.user_id as string) === session.userId) {
          throw new HttpError(409, "conflict", "This desk is already assigned to you for the selected day.");
        }

        throw new HttpError(409, "conflict", "This desk is already assigned to another user for the selected day.");
      }

      const deskReservationConflict = (deskReservations ?? []).find((reservation) =>
        overlapsSegment(segment, reservation.time_segment as "full" | "am" | "pm"),
      );

      if (deskReservationConflict) {
        if ((deskReservationConflict.user_id as string) === session.userId) {
          throw new HttpError(409, "conflict", "You already booked this desk for the selected segment.");
        }

        throw new HttpError(409, "conflict", "This desk is already booked for the selected segment.");
      }

      const userReservationConflict = (userReservations ?? []).find((reservation) =>
        overlapsSegment(segment, reservation.time_segment as "full" | "am" | "pm"),
      );

      if (userReservationConflict) {
        throw new HttpError(409, "conflict", "You already have another reservation in this room for the selected segment.");
      }

      const nowIso = new Date().toISOString();
      const { data: reservation, error: reservationError } = await supabase
        .from("reservations")
        .insert({
          room_id: roomId,
          desk_id: deskId,
          user_id: session.userId,
          status: "approved",
          time_segment: segment,
          date_start: date,
          date_end: date,
          notes,
          created_by: session.userId,
          approved_by: session.userId,
          approved_at: nowIso,
        })
        .select("id, room_id, desk_id, user_id, status, time_segment, date_start, date_end, notes, created_at")
        .single();

      if (reservationError || !reservation) {
        throw new HttpError(500, "internal_error", "Failed to create reservation.", reservationError?.message);
      }

      await writeAuditEvent(supabase, {
        actorUserId: session.userId,
        organizationId,
        action: "reservation.created",
        entityType: "reservation",
        entityId: reservation.id as string,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
        details: {
          roomId,
          deskId,
          segment,
          date,
        },
      });

      return jsonResponse(req, {
        organization,
        reservation: {
          id: reservation.id as string,
          roomId: reservation.room_id as string,
          roomName: roomDesk.room?.name as string,
          deskId: reservation.desk_id as string,
          deskLabel: (roomDesk.label as string | null | undefined) ?? null,
          userId: reservation.user_id as string,
          status: reservation.status as "pending" | "approved",
          segment: reservation.time_segment as "full" | "am" | "pm",
          dateStart: reservation.date_start as string,
          dateEnd: reservation.date_end as string,
          notes: (reservation.notes as string | null | undefined) ?? null,
          createdAt: reservation.created_at as string,
        },
      });
    }

    if (req.method === "DELETE") {
      const body = (await req.json()) as CancelReservationBody;
      const organizationId = body.organizationId?.trim();
      const reservationId = body.reservationId?.trim();

      if (!organizationId || !reservationId) {
        throw new HttpError(400, "bad_request", "organizationId and reservationId are required.");
      }

      const organization = await requireOrganizationAccess(supabase, session.user, organizationId, "member");

      const { data: reservation, error: reservationError } = await supabase
        .from("reservations")
        .select("id, user_id, room_id, status, desk_id, time_segment, date_start, room:rooms!inner(id, organization_id, name)")
        .eq("id", reservationId)
        .maybeSingle();

      if (reservationError) {
        throw new HttpError(500, "internal_error", "Failed to verify reservation.", reservationError.message);
      }

      if (!reservation || reservation.room?.organization_id !== organizationId) {
        throw new HttpError(404, "not_found", "Reservation not found.");
      }

      const roomScope = await requireRoomScope(supabase, organization, session.user, reservation.room_id as string);
      const canCancel =
        session.user.role === "super_admin" ||
        organization.membershipRole === "admin" ||
        roomScope.accessRole === "admin" ||
        (reservation.user_id as string) === session.userId;

      if (!canCancel) {
        throw new HttpError(403, "forbidden", "You cannot cancel this reservation.");
      }

      if (reservation.status === "cancelled") {
        throw new HttpError(409, "conflict", "This reservation is already cancelled.");
      }

      const { error: cancelError } = await supabase
        .from("reservations")
        .update({
          status: "cancelled",
          cancelled_by: session.userId,
          cancelled_at: new Date().toISOString(),
        })
        .eq("id", reservationId);

      if (cancelError) {
        throw new HttpError(500, "internal_error", "Failed to cancel reservation.", cancelError.message);
      }

      await writeAuditEvent(supabase, {
        actorUserId: session.userId,
        organizationId,
        action: "reservation.cancelled",
        entityType: "reservation",
        entityId: reservationId,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
        details: {
          roomId: reservation.room_id as string,
          deskId: reservation.desk_id as string,
          segment: reservation.time_segment as string,
          date: reservation.date_start as string,
        },
      });

      return jsonResponse(req, {
        organization,
        reservationId,
        cancelled: true,
      });
    }

    throw new HttpError(405, "bad_request", "Unsupported method.");
  }),
);
