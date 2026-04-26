import { createAdminClient } from "../_shared/supabase-admin.ts";
import { getUserDirectory } from "../_shared/user-directory.ts";
import { withJsonHandler, HttpError, jsonResponse } from "../_shared/http.ts";
import { requireOrganizationAccess } from "../_shared/organizations.ts";
import { requireActiveSession } from "../_shared/sessions.ts";

function isIsoDate(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isIsoTimestamp(value: string | null) {
  return Boolean(value && !Number.isNaN(Date.parse(value)));
}

Deno.serve((req) =>
  withJsonHandler(req, async () => {
    if (req.method !== "GET") {
      throw new HttpError(405, "bad_request", "Unsupported method.");
    }

    const url = new URL(req.url);
    const organizationId = url.searchParams.get("organizationId");
    const date = url.searchParams.get("date");
    const windowStart = url.searchParams.get("windowStart");
    const windowEnd = url.searchParams.get("windowEnd");

    if (!organizationId || !isIsoDate(date) || !isIsoTimestamp(windowStart) || !isIsoTimestamp(windowEnd)) {
      throw new HttpError(400, "bad_request", "organizationId, date, windowStart and windowEnd are required.");
    }

    if (new Date(windowStart!).getTime() >= new Date(windowEnd!).getTime()) {
      throw new HttpError(400, "bad_request", "Invalid overview window.");
    }

    const supabase = createAdminClient();
    const session = await requireActiveSession(req, supabase);
    const organizationScope = await requireOrganizationAccess(supabase, session.user, organizationId);

    const { data: offices, error: officesError } = await supabase
      .from("offices")
      .select(
        `
          id,
          organization_id,
          owner_user_id,
          name,
          slug,
          description,
          floor_label,
          location_label,
          capacity,
          is_active
        `,
      )
      .eq("organization_id", organizationId)
      .order("name", { ascending: true });

    if (officesError) {
      throw new HttpError(500, "internal_error", "Failed to load offices.", officesError.message);
    }

    const officeIds = (offices ?? []).map((office) => office.id as string);

    const [releaseWindowsResult, bookingsResult, ownerDirectory] = await Promise.all([
      officeIds.length
        ? supabase
            .from("office_release_windows")
            .select("id, office_id, release_kind, starts_at, ends_at, note, released_by_user_id, created_at")
            .in("office_id", officeIds)
            .lt("starts_at", windowEnd!)
            .gt("ends_at", windowStart!)
            .order("starts_at", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      officeIds.length
        ? supabase
            .from("office_bookings")
            .select(
              "id, office_id, user_id, status, starts_at, ends_at, attendee_count, note, cancelled_at, cancelled_by_user_id, created_at",
            )
            .in("office_id", officeIds)
            .lt("starts_at", windowEnd!)
            .gt("ends_at", windowStart!)
            .order("starts_at", { ascending: true })
        : Promise.resolve({ data: [], error: null }),
      getUserDirectory(
        supabase,
        (offices ?? []).flatMap((office) => (office.owner_user_id ? [office.owner_user_id as string] : [])),
      ),
    ]);

    if (releaseWindowsResult.error) {
      throw new HttpError(
        500,
        "internal_error",
        "Failed to load office release windows.",
        releaseWindowsResult.error.message,
      );
    }

    if (bookingsResult.error) {
      throw new HttpError(500, "internal_error", "Failed to load office bookings.", bookingsResult.error.message);
    }

    const bookingActors = (bookingsResult.data ?? []).flatMap((booking) => {
      const values = [booking.user_id as string];

      if (booking.cancelled_by_user_id) {
        values.push(booking.cancelled_by_user_id as string);
      }

      return values;
    });

    const releaseActors = (releaseWindowsResult.data ?? []).flatMap((window) =>
      window.released_by_user_id ? [window.released_by_user_id as string] : [],
    );

    const actorDirectory = await getUserDirectory(supabase, [...bookingActors, ...releaseActors]);

    const releaseWindowsByOfficeId = new Map<string, unknown[]>();
    for (const window of releaseWindowsResult.data ?? []) {
      const officeReleaseWindows = releaseWindowsByOfficeId.get(window.office_id as string) ?? [];

      officeReleaseWindows.push({
        id: window.id,
        releaseKind: window.release_kind,
        startsAt: window.starts_at,
        endsAt: window.ends_at,
        note: window.note,
        releasedBy: window.released_by_user_id
          ? actorDirectory[window.released_by_user_id as string]?.displayName ?? "Unknown"
          : null,
        createdAt: window.created_at,
      });

      releaseWindowsByOfficeId.set(window.office_id as string, officeReleaseWindows);
    }

    const bookingsByOfficeId = new Map<string, unknown[]>();
    for (const booking of bookingsResult.data ?? []) {
      const officeBookings = bookingsByOfficeId.get(booking.office_id as string) ?? [];

      officeBookings.push({
        id: booking.id,
        userId: booking.user_id,
        bookedBy: actorDirectory[booking.user_id as string]?.displayName ?? "Unknown",
        status: booking.status,
        startsAt: booking.starts_at,
        endsAt: booking.ends_at,
        attendeeCount: booking.attendee_count,
        note: booking.note,
        cancelledAt: booking.cancelled_at,
        cancelledBy: booking.cancelled_by_user_id
          ? actorDirectory[booking.cancelled_by_user_id as string]?.displayName ?? "Unknown"
          : null,
        canCancel:
          booking.status === "active" &&
          (booking.user_id === session.userId ||
            officeIds.length > 0 &&
              ((offices ?? []).find((office) => office.id === booking.office_id)?.owner_user_id === session.userId ||
                session.user.role === "super_admin" ||
                organizationScope.membershipRole === "admin")),
      });

      bookingsByOfficeId.set(booking.office_id as string, officeBookings);
    }

    const responseOffices = (offices ?? []).map((office) => ({
      id: office.id,
      organizationId: office.organization_id,
      ownerUserId: office.owner_user_id,
      ownerLabel: office.owner_user_id ? ownerDirectory[office.owner_user_id as string]?.displayName ?? "Unknown" : null,
      name: office.name,
      slug: office.slug,
      description: office.description,
      floorLabel: office.floor_label,
      locationLabel: office.location_label,
      capacity: office.capacity,
      isActive: office.is_active,
      isOwnedByCurrentUser: office.owner_user_id === session.userId,
      isManageableByCurrentUser:
        session.user.role === "super_admin" ||
        organizationScope.membershipRole === "admin" ||
        office.owner_user_id === session.userId,
      releaseWindows: releaseWindowsByOfficeId.get(office.id as string) ?? [],
      bookings: bookingsByOfficeId.get(office.id as string) ?? [],
    }));

    return jsonResponse(req, {
      date,
      organization: organizationScope,
      offices: responseOffices,
    });
  }),
);
