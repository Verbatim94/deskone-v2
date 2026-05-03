import { withJsonHandler, HttpError, jsonResponse } from "../_shared/http.ts";
import { requireOrganizationAccess } from "../_shared/organizations.ts";
import { listAccessibleRoomScopes } from "../_shared/rooms.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { requireActiveSession } from "../_shared/sessions.ts";

function normalizeIsoDate(fieldName: string, value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, "bad_request", `${fieldName} must use YYYY-MM-DD format.`);
  }

  return value;
}

function dateRange(fromDate: string, toDate: string) {
  const dates: string[] = [];
  const cursor = new Date(`${fromDate}T00:00:00.000Z`);
  const end = new Date(`${toDate}T00:00:00.000Z`);

  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function expandDateRange(fromDate: string, toDate: string, minDate: string, maxDate: string) {
  const start = fromDate > minDate ? fromDate : minDate;
  const end = toDate < maxDate ? toDate : maxDate;

  if (start > end) {
    return [];
  }

  return dateRange(start, end);
}

type SegmentOccupancy = {
  am: Set<string>;
  pm: Set<string>;
};

function ensureOccupancy(map: Map<string, SegmentOccupancy>, date: string) {
  const current = map.get(date);
  if (current) {
    return current;
  }

  const next = {
    am: new Set<string>(),
    pm: new Set<string>(),
  };
  map.set(date, next);
  return next;
}

Deno.serve((req) =>
  withJsonHandler(req, async () => {
    if (req.method !== "GET") {
      throw new HttpError(405, "bad_request", "Unsupported method.");
    }

    const url = new URL(req.url);
    const organizationId = url.searchParams.get("organizationId")?.trim();
    const fromDate = normalizeIsoDate("fromDate", url.searchParams.get("fromDate"));
    const toDate = normalizeIsoDate("toDate", url.searchParams.get("toDate"));

    if (!organizationId) {
      throw new HttpError(400, "bad_request", "organizationId is required.");
    }

    if (fromDate > toDate) {
      throw new HttpError(400, "bad_request", "Invalid date range.");
    }

    const supabase = createAdminClient();
    const session = await requireActiveSession(req, supabase);
    const organization = await requireOrganizationAccess(supabase, session.user, organizationId, "member");
    const roomScopes = await listAccessibleRoomScopes(supabase, organization, session.user);
    const roomIds = roomScopes.map((scope) => scope.roomId);
    const calendarDays = dateRange(fromDate, toDate);

    if (!roomIds.length) {
      return jsonResponse(req, {
        organization,
        fromDate,
        toDate,
        days: calendarDays.map((date) => ({
          date,
          hasUserBooking: false,
          fullyBooked: false,
        })),
      });
    }

    const [
      { data: desks, error: desksError },
      { data: reservations, error: reservationsError },
      { data: assignments, error: assignmentsError },
    ] = await Promise.all([
      supabase
        .from("room_desks")
        .select("id, default_status")
        .in("room_id", roomIds),
      supabase
        .from("reservations")
        .select("desk_id, user_id, time_segment, date_start, date_end, status")
        .in("room_id", roomIds)
        .lte("date_start", toDate)
        .gte("date_end", fromDate)
        .in("status", ["pending", "approved"]),
      supabase
        .from("desk_assignments")
        .select("id, desk_id, date_start, date_end")
        .in("room_id", roomIds)
        .lte("date_start", toDate)
        .gte("date_end", fromDate),
    ]);

    if (desksError || reservationsError || assignmentsError) {
      throw new HttpError(
        500,
        "internal_error",
        "Failed to build dashboard calendar.",
        desksError?.message || reservationsError?.message || assignmentsError?.message,
      );
    }

    const activeDeskIds = new Set(
      (desks ?? [])
        .filter((desk) => (desk.default_status as string) !== "restricted")
        .map((desk) => desk.id as string),
    );
    const totalActiveDesks = activeDeskIds.size;

    const assignmentIds = (assignments ?? []).map((assignment) => assignment.id as string);
    const { data: assignmentExceptions, error: assignmentExceptionsError } = assignmentIds.length
      ? await supabase
          .from("desk_assignment_exceptions")
          .select("assignment_id, exception_date")
          .in("assignment_id", assignmentIds)
          .gte("exception_date", fromDate)
          .lte("exception_date", toDate)
      : { data: [], error: null };

    if (assignmentExceptionsError) {
      throw new HttpError(
        500,
        "internal_error",
        "Failed to resolve assignment exceptions.",
        assignmentExceptionsError.message,
      );
    }

    const skippedAssignmentsById = new Map<string, Set<string>>();
    for (const entry of assignmentExceptions ?? []) {
      const assignmentId = entry.assignment_id as string;
      const dates = skippedAssignmentsById.get(assignmentId) ?? new Set<string>();
      dates.add(entry.exception_date as string);
      skippedAssignmentsById.set(assignmentId, dates);
    }

    const occupancyByDate = new Map<string, SegmentOccupancy>();
    const userBookingDates = new Set<string>();

    for (const assignment of assignments ?? []) {
      const deskId = assignment.desk_id as string;
      if (!activeDeskIds.has(deskId)) {
        continue;
      }

      const skippedDates = skippedAssignmentsById.get(assignment.id as string) ?? new Set<string>();
      for (const date of expandDateRange(
        assignment.date_start as string,
        assignment.date_end as string,
        fromDate,
        toDate,
      )) {
        if (skippedDates.has(date)) {
          continue;
        }

        const occupancy = ensureOccupancy(occupancyByDate, date);
        occupancy.am.add(deskId);
        occupancy.pm.add(deskId);
      }
    }

    for (const reservation of reservations ?? []) {
      const deskId = reservation.desk_id as string;
      if (!activeDeskIds.has(deskId)) {
        continue;
      }

      const segment = reservation.time_segment as "full" | "am" | "pm";
      const isOwnReservation = (reservation.user_id as string) === session.userId;

      for (const date of expandDateRange(
        reservation.date_start as string,
        reservation.date_end as string,
        fromDate,
        toDate,
      )) {
        const occupancy = ensureOccupancy(occupancyByDate, date);

        if (segment === "full" || segment === "am") {
          occupancy.am.add(deskId);
        }

        if (segment === "full" || segment === "pm") {
          occupancy.pm.add(deskId);
        }

        if (isOwnReservation) {
          userBookingDates.add(date);
        }
      }
    }

    return jsonResponse(req, {
      organization,
      fromDate,
      toDate,
      days: calendarDays.map((date) => {
        const occupancy = occupancyByDate.get(date);
        const fullyBooked = Boolean(
          totalActiveDesks &&
            occupancy &&
            occupancy.am.size >= totalActiveDesks &&
            occupancy.pm.size >= totalActiveDesks,
        );

        return {
          date,
          hasUserBooking: userBookingDates.has(date),
          fullyBooked: fullyBooked && !userBookingDates.has(date),
        };
      }),
    });
  }),
);
