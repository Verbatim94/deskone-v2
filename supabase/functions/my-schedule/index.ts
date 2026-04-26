import { withJsonHandler, HttpError, jsonResponse } from "../_shared/http.ts";
import { requireOrganizationAccess } from "../_shared/organizations.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { requireActiveSession } from "../_shared/sessions.ts";

function normalizeIsoDate(fieldName: string, value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, "bad_request", `${fieldName} must use YYYY-MM-DD format.`);
  }

  return value;
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

    const windowStart = `${fromDate}T00:00:00.000Z`;
    const windowEnd = `${toDate}T23:59:59.999Z`;

    const supabase = createAdminClient();
    const session = await requireActiveSession(req, supabase);
    const organization = await requireOrganizationAccess(supabase, session.user, organizationId, "member");

    const [{ data: roomReservations, error: roomReservationsError }, { data: officeBookings, error: officeBookingsError }] =
      await Promise.all([
        supabase
          .from("reservations")
          .select("id, room_id, desk_id, status, time_segment, date_start, date_end, notes, created_at, cancelled_at")
          .eq("user_id", session.userId)
          .gte("date_end", fromDate)
          .lte("date_start", toDate)
          .order("date_start", { ascending: true }),
        supabase
          .from("office_bookings")
          .select("id, office_id, status, starts_at, ends_at, attendee_count, note, cancelled_at, created_at")
          .eq("user_id", session.userId)
          .lt("starts_at", windowEnd)
          .gt("ends_at", windowStart)
          .order("starts_at", { ascending: true }),
      ]);

    if (roomReservationsError || officeBookingsError) {
      throw new HttpError(
        500,
        "internal_error",
        "Failed to load personal bookings.",
        roomReservationsError?.message || officeBookingsError?.message,
      );
    }

    const roomIds = Array.from(new Set((roomReservations ?? []).map((reservation) => reservation.room_id as string)));
    const deskIds = Array.from(new Set((roomReservations ?? []).map((reservation) => reservation.desk_id as string)));
    const officeIds = Array.from(new Set((officeBookings ?? []).map((booking) => booking.office_id as string)));

    const [{ data: rooms, error: roomsError }, { data: desks, error: desksError }, { data: offices, error: officesError }] =
      await Promise.all([
        roomIds.length
          ? supabase
              .from("rooms")
              .select("id, organization_id, name, slug")
              .eq("organization_id", organizationId)
              .in("id", roomIds)
          : Promise.resolve({ data: [], error: null }),
        deskIds.length
          ? supabase.from("room_desks").select("id, room_id, label").in("id", deskIds)
          : Promise.resolve({ data: [], error: null }),
        officeIds.length
          ? supabase
              .from("offices")
              .select("id, organization_id, name, slug, floor_label, location_label")
              .eq("organization_id", organizationId)
              .in("id", officeIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

    if (roomsError || desksError || officesError) {
      throw new HttpError(
        500,
        "internal_error",
        "Failed to hydrate personal bookings.",
        roomsError?.message || desksError?.message || officesError?.message,
      );
    }

    const roomById = new Map((rooms ?? []).map((room) => [room.id as string, room]));
    const deskById = new Map((desks ?? []).map((desk) => [desk.id as string, desk]));
    const officeById = new Map((offices ?? []).map((office) => [office.id as string, office]));

    return jsonResponse(req, {
      organization,
      roomReservations: (roomReservations ?? [])
        .filter((reservation) => roomById.has(reservation.room_id as string))
        .map((reservation) => {
          const room = roomById.get(reservation.room_id as string)!;
          const desk = deskById.get(reservation.desk_id as string) ?? null;

          return {
            id: reservation.id as string,
            roomId: room.id as string,
            roomName: room.name as string,
            roomSlug: room.slug as string,
            deskId: reservation.desk_id as string,
            deskLabel: (desk?.label as string | null | undefined) ?? null,
            status: reservation.status as "pending" | "approved" | "rejected" | "cancelled",
            segment: reservation.time_segment as "full" | "am" | "pm",
            dateStart: reservation.date_start as string,
            dateEnd: reservation.date_end as string,
            notes: (reservation.notes as string | null | undefined) ?? null,
            cancelledAt: (reservation.cancelled_at as string | null | undefined) ?? null,
            createdAt: reservation.created_at as string,
          };
        }),
      officeBookings: (officeBookings ?? [])
        .filter((booking) => officeById.has(booking.office_id as string))
        .map((booking) => {
          const office = officeById.get(booking.office_id as string)!;

          return {
            id: booking.id as string,
            officeId: office.id as string,
            officeName: office.name as string,
            officeSlug: office.slug as string,
            floorLabel: (office.floor_label as string | null | undefined) ?? null,
            locationLabel: (office.location_label as string | null | undefined) ?? null,
            status: booking.status as "active" | "cancelled" | "completed",
            startsAt: booking.starts_at as string,
            endsAt: booking.ends_at as string,
            attendeeCount: booking.attendee_count as number,
            note: (booking.note as string | null | undefined) ?? null,
            cancelledAt: (booking.cancelled_at as string | null | undefined) ?? null,
            createdAt: booking.created_at as string,
          };
        }),
    });
  }),
);
