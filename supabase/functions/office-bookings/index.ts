import { writeAuditEvent } from "../_shared/audit.ts";
import { withJsonHandler, HttpError, jsonResponse } from "../_shared/http.ts";
import { requireOrganizationAccess } from "../_shared/organizations.ts";
import { getClientIp, getUserAgent, requireActiveSession } from "../_shared/sessions.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";

type CreateOfficeBookingBody = {
  organizationId?: string;
  officeId?: string;
  startsAt?: string;
  endsAt?: string;
  attendeeCount?: number;
  note?: string | null;
};

type CancelOfficeBookingBody = {
  organizationId?: string;
  bookingId?: string;
};

function isValidTimestamp(value: string | undefined) {
  return Boolean(value && !Number.isNaN(Date.parse(value)));
}

function isQuarterHourBoundary(value: Date) {
  return value.getUTCSeconds() === 0 && value.getUTCMilliseconds() === 0 && value.getUTCMinutes() % 15 === 0;
}

Deno.serve((req) =>
  withJsonHandler(req, async () => {
    if (req.method !== "POST" && req.method !== "DELETE") {
      throw new HttpError(405, "bad_request", "Unsupported method.");
    }

    const supabase = createAdminClient();
    const session = await requireActiveSession(req, supabase);

    if (req.method === "DELETE") {
      const body = (await req.json()) as CancelOfficeBookingBody;
      const organizationId = body.organizationId?.trim();
      const bookingId = body.bookingId?.trim();

      if (!organizationId || !bookingId) {
        throw new HttpError(400, "bad_request", "organizationId and bookingId are required.");
      }

      const organizationScope = await requireOrganizationAccess(supabase, session.user, organizationId);

      const { data: booking, error: bookingError } = await supabase
        .from("office_bookings")
        .select("id, office_id, user_id, status, starts_at, ends_at")
        .eq("id", bookingId)
        .maybeSingle();

      if (bookingError) {
        throw new HttpError(500, "internal_error", "Failed to load booking.", bookingError.message);
      }

      if (!booking) {
        throw new HttpError(404, "not_found", "Booking not found.");
      }

      const { data: office, error: officeError } = await supabase
        .from("offices")
        .select("id, organization_id, owner_user_id, name")
        .eq("id", booking.office_id)
        .maybeSingle();

      if (officeError) {
        throw new HttpError(500, "internal_error", "Failed to load office.", officeError.message);
      }

      if (!office || office.organization_id !== organizationId) {
        throw new HttpError(404, "not_found", "Office not found.");
      }

      if (booking.status !== "active") {
        throw new HttpError(409, "conflict", "Only active bookings can be cancelled.");
      }

      const canCancel =
        booking.user_id === session.userId ||
        office.owner_user_id === session.userId ||
        session.user.role === "super_admin" ||
        organizationScope.membershipRole === "admin";

      if (!canCancel) {
        throw new HttpError(403, "forbidden", "You cannot cancel this booking.");
      }

      const { error: cancelError } = await supabase
        .from("office_bookings")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancelled_by_user_id: session.userId,
        })
        .eq("id", bookingId)
        .eq("status", "active");

      if (cancelError) {
        throw new HttpError(500, "internal_error", "Failed to cancel booking.", cancelError.message);
      }

      await writeAuditEvent(supabase, {
        actorUserId: session.userId,
        organizationId,
        action: "office.booking.cancelled",
        entityType: "office_booking",
        entityId: bookingId,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
        details: {
          officeId: office.id,
          officeName: office.name,
          bookingOwnerUserId: booking.user_id,
          startsAt: booking.starts_at,
          endsAt: booking.ends_at,
        },
      });

      return jsonResponse(req, { success: true }, { status: 200 });
    }

    const body = (await req.json()) as CreateOfficeBookingBody;
    const organizationId = body.organizationId?.trim();
    const officeId = body.officeId?.trim();
    const startsAt = body.startsAt;
    const endsAt = body.endsAt;
    const attendeeCount = Math.max(1, Math.floor(Number(body.attendeeCount ?? 1)));
    const note = body.note?.trim() || null;

    if (!organizationId || !officeId || !isValidTimestamp(startsAt) || !isValidTimestamp(endsAt)) {
      throw new HttpError(400, "bad_request", "organizationId, officeId, startsAt and endsAt are required.");
    }

    await requireOrganizationAccess(supabase, session.user, organizationId);

    const startDate = new Date(startsAt!);
    const endDate = new Date(endsAt!);

    if (startDate.getTime() >= endDate.getTime()) {
      throw new HttpError(400, "bad_request", "Booking end must be after the start.");
    }

    if (!isQuarterHourBoundary(startDate) || !isQuarterHourBoundary(endDate)) {
      throw new HttpError(400, "bad_request", "Bookings must align to 15-minute boundaries.");
    }

    if (endDate.getTime() - startDate.getTime() > 8 * 60 * 60 * 1000) {
      throw new HttpError(400, "bad_request", "Bookings cannot exceed 8 hours.");
    }

    const { data: office, error: officeError } = await supabase
      .from("offices")
      .select("id, organization_id, owner_user_id, name, capacity, is_active")
      .eq("id", officeId)
      .maybeSingle();

    if (officeError) {
      throw new HttpError(500, "internal_error", "Failed to load office.", officeError.message);
    }

    if (!office || office.organization_id !== organizationId || office.is_active !== true) {
      throw new HttpError(404, "not_found", "Office not found.");
    }

    if (attendeeCount > Number(office.capacity)) {
      throw new HttpError(400, "bad_request", "Attendee count exceeds the office capacity.");
    }

    const { data: releaseWindow, error: releaseWindowError } = await supabase
      .from("office_release_windows")
      .select("id")
      .eq("office_id", officeId)
      .lte("starts_at", startsAt!)
      .gte("ends_at", endsAt!)
      .limit(1)
      .maybeSingle();

    if (releaseWindowError) {
      throw new HttpError(500, "internal_error", "Failed to verify office release.", releaseWindowError.message);
    }

    if (!releaseWindow) {
      throw new HttpError(409, "conflict", "The office is not released for the requested time window.");
    }

    const { data: createdBooking, error: insertError } = await supabase
      .from("office_bookings")
      .insert({
        office_id: officeId,
        user_id: session.userId,
        starts_at: startsAt,
        ends_at: endsAt,
        attendee_count: attendeeCount,
        note,
      })
      .select("id, office_id, user_id, status, starts_at, ends_at, attendee_count, note, created_at")
      .single();

    if (insertError) {
      const isOverlapError =
        insertError.code === "23P01" || insertError.message.toLowerCase().includes("office_bookings_no_overlap");

      if (isOverlapError) {
        throw new HttpError(409, "conflict", "This office already has a booking in the requested time range.");
      }

      throw new HttpError(500, "internal_error", "Failed to create booking.", insertError.message);
    }

    await writeAuditEvent(supabase, {
      actorUserId: session.userId,
      organizationId,
      action: "office.booking.created",
      entityType: "office_booking",
      entityId: createdBooking.id as string,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
      details: {
        officeId,
        officeName: office.name,
        startsAt,
        endsAt,
        attendeeCount,
      },
    });

    return jsonResponse(req, {
      booking: {
        id: createdBooking.id,
        officeId: createdBooking.office_id,
        userId: createdBooking.user_id,
        status: createdBooking.status,
        startsAt: createdBooking.starts_at,
        endsAt: createdBooking.ends_at,
        attendeeCount: createdBooking.attendee_count,
        note: createdBooking.note,
        createdAt: createdBooking.created_at,
      },
    });
  }),
);
