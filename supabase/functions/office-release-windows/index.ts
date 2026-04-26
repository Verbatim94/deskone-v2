import { writeAuditEvent } from "../_shared/audit.ts";
import { requireOrganizationAccess } from "../_shared/organizations.ts";
import { createAdminClient } from "../_shared/supabase-admin.ts";
import { getClientIp, getUserAgent, requireActiveSession } from "../_shared/sessions.ts";
import { withJsonHandler, HttpError, jsonResponse } from "../_shared/http.ts";

type ReleaseWindowBody = {
  organizationId?: string;
  officeId?: string;
  releaseKind?: "morning" | "afternoon" | "full_day" | "custom";
  startsAt?: string;
  endsAt?: string;
  note?: string | null;
  releaseWindowId?: string;
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
    const body = (await req.json()) as ReleaseWindowBody;
    const organizationId = body.organizationId?.trim();

    if (!organizationId) {
      throw new HttpError(400, "bad_request", "organizationId is required.");
    }

    const organizationScope = await requireOrganizationAccess(supabase, session.user, organizationId);

    if (req.method === "DELETE") {
      const releaseWindowId = body.releaseWindowId?.trim();

      if (!releaseWindowId) {
        throw new HttpError(400, "bad_request", "releaseWindowId is required.");
      }

      const { data: releaseWindow, error: releaseWindowError } = await supabase
        .from("office_release_windows")
        .select("id, office_id, starts_at, ends_at")
        .eq("id", releaseWindowId)
        .maybeSingle();

      if (releaseWindowError) {
        throw new HttpError(500, "internal_error", "Failed to load release window.", releaseWindowError.message);
      }

      if (!releaseWindow) {
        throw new HttpError(404, "not_found", "Release window not found.");
      }

      const { data: office, error: officeError } = await supabase
        .from("offices")
        .select("id, organization_id, owner_user_id, name")
        .eq("id", releaseWindow.office_id)
        .maybeSingle();

      if (officeError) {
        throw new HttpError(500, "internal_error", "Failed to load office.", officeError.message);
      }

      if (!office || office.organization_id !== organizationId) {
        throw new HttpError(404, "not_found", "Office not found.");
      }

      const canManageOffice =
        session.user.role === "super_admin" ||
        organizationScope.membershipRole === "admin" ||
        office.owner_user_id === session.userId;

      if (!canManageOffice) {
        throw new HttpError(403, "forbidden", "Only the owner or an admin can manage office release windows.");
      }

      const { data: overlappingBooking, error: bookingError } = await supabase
        .from("office_bookings")
        .select("id")
        .eq("office_id", office.id)
        .eq("status", "active")
        .lt("starts_at", releaseWindow.ends_at as string)
        .gt("ends_at", releaseWindow.starts_at as string)
        .limit(1)
        .maybeSingle();

      if (bookingError) {
        throw new HttpError(500, "internal_error", "Failed to verify active bookings.", bookingError.message);
      }

      if (overlappingBooking) {
        throw new HttpError(409, "conflict", "You cannot remove a release window that still contains active bookings.");
      }

      const { error: deleteError } = await supabase
        .from("office_release_windows")
        .delete()
        .eq("id", releaseWindowId);

      if (deleteError) {
        throw new HttpError(500, "internal_error", "Failed to delete release window.", deleteError.message);
      }

      await writeAuditEvent(supabase, {
        actorUserId: session.userId,
        organizationId,
        action: "office.release_window.deleted",
        entityType: "office_release_window",
        entityId: releaseWindowId,
        ipAddress: getClientIp(req),
        userAgent: getUserAgent(req),
        details: {
          officeId: office.id,
          officeName: office.name,
        },
      });

      return jsonResponse(req, { success: true }, { status: 200 });
    }

    const officeId = body.officeId?.trim();
    const releaseKind = body.releaseKind;
    const startsAt = body.startsAt;
    const endsAt = body.endsAt;
    const note = body.note?.trim() || null;

    if (!officeId || !releaseKind || !isValidTimestamp(startsAt) || !isValidTimestamp(endsAt)) {
      throw new HttpError(400, "bad_request", "officeId, releaseKind, startsAt and endsAt are required.");
    }

    const startDate = new Date(startsAt!);
    const endDate = new Date(endsAt!);

    if (startDate.getTime() >= endDate.getTime()) {
      throw new HttpError(400, "bad_request", "Release window end must be after the start.");
    }

    if (startDate.toISOString().slice(0, 10) !== endDate.toISOString().slice(0, 10)) {
      throw new HttpError(400, "bad_request", "Release windows must stay within a single day.");
    }

    if (!isQuarterHourBoundary(startDate) || !isQuarterHourBoundary(endDate)) {
      throw new HttpError(400, "bad_request", "Release windows must align to 15-minute boundaries.");
    }

    const { data: office, error: officeError } = await supabase
      .from("offices")
      .select("id, organization_id, owner_user_id, name, is_active")
      .eq("id", officeId)
      .maybeSingle();

    if (officeError) {
      throw new HttpError(500, "internal_error", "Failed to load office.", officeError.message);
    }

    if (!office || office.organization_id !== organizationId || office.is_active !== true) {
      throw new HttpError(404, "not_found", "Office not found.");
    }

    const canManageOffice =
      session.user.role === "super_admin" ||
      organizationScope.membershipRole === "admin" ||
      office.owner_user_id === session.userId;

    if (!canManageOffice) {
      throw new HttpError(403, "forbidden", "Only the owner or an admin can release the office.");
    }

    const { data: conflictingWindow, error: conflictingWindowError } = await supabase
      .from("office_release_windows")
      .select("id")
      .eq("office_id", officeId)
      .lt("starts_at", endsAt!)
      .gt("ends_at", startsAt!)
      .limit(1)
      .maybeSingle();

    if (conflictingWindowError) {
      throw new HttpError(500, "internal_error", "Failed to verify release windows.", conflictingWindowError.message);
    }

    if (conflictingWindow) {
      throw new HttpError(409, "conflict", "This release window overlaps an existing release.");
    }

    const { data: createdWindow, error: insertError } = await supabase
      .from("office_release_windows")
      .insert({
        office_id: officeId,
        released_by_user_id: session.userId,
        release_kind: releaseKind,
        starts_at: startsAt,
        ends_at: endsAt,
        note,
      })
      .select("id, office_id, release_kind, starts_at, ends_at, note, created_at")
      .single();

    if (insertError) {
      throw new HttpError(500, "internal_error", "Failed to create release window.", insertError.message);
    }

    await writeAuditEvent(supabase, {
      actorUserId: session.userId,
      organizationId,
      action: "office.release_window.created",
      entityType: "office_release_window",
      entityId: createdWindow.id as string,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
      details: {
        officeId,
        officeName: office.name,
        releaseKind,
        startsAt,
        endsAt,
      },
    });

    return jsonResponse(req, {
      releaseWindow: {
        id: createdWindow.id,
        officeId: createdWindow.office_id,
        releaseKind: createdWindow.release_kind,
        startsAt: createdWindow.starts_at,
        endsAt: createdWindow.ends_at,
        note: createdWindow.note,
        createdAt: createdWindow.created_at,
      },
    });
  }),
);
