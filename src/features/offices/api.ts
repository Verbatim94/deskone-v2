import { invokeEdgeFunction } from "@/lib/api-client";
import { requireSessionToken } from "@/features/auth/require-session-token";

export type OfficeReleaseKind = "morning" | "afternoon" | "full_day" | "custom";

export type OfficeReleaseWindow = {
  id: string;
  releaseKind: OfficeReleaseKind;
  startsAt: string;
  endsAt: string;
  note: string | null;
  releasedBy: string | null;
  createdAt: string;
};

export type OfficeBooking = {
  id: string;
  userId: string;
  bookedBy: string;
  status: "active" | "cancelled" | "completed";
  startsAt: string;
  endsAt: string;
  attendeeCount: number;
  note: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  canCancel: boolean;
};

export type OfficeOverview = {
  id: string;
  organizationId: string;
  ownerUserId: string | null;
  ownerLabel: string | null;
  name: string;
  slug: string;
  description: string | null;
  floorLabel: string | null;
  locationLabel: string | null;
  capacity: number;
  isActive: boolean;
  isOwnedByCurrentUser: boolean;
  isManageableByCurrentUser: boolean;
  releaseWindows: OfficeReleaseWindow[];
  bookings: OfficeBooking[];
};

export type OfficesOverviewResponse = {
  date: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    membershipRole: "admin" | "member";
  };
  offices: OfficeOverview[];
};

export type CreateOfficeReleaseWindowInput = {
  organizationId: string;
  officeId: string;
  releaseKind: OfficeReleaseKind;
  startsAt: string;
  endsAt: string;
  note?: string | null;
};

export type CreateOfficeBookingInput = {
  organizationId: string;
  officeId: string;
  startsAt: string;
  endsAt: string;
  attendeeCount: number;
  note?: string | null;
};

export async function getOfficesOverview(input: {
  organizationId: string;
  date: string;
  windowStart: string;
  windowEnd: string;
}) {
  return invokeEdgeFunction<OfficesOverviewResponse>("offices-overview", {
    method: "GET",
    sessionToken: requireSessionToken(),
    query: input,
  });
}

export async function createOfficeReleaseWindow(input: CreateOfficeReleaseWindowInput) {
  return invokeEdgeFunction<{ releaseWindow: OfficeReleaseWindow }>("office-release-windows", {
    method: "POST",
    sessionToken: requireSessionToken(),
    body: input,
  });
}

export async function deleteOfficeReleaseWindow(input: { organizationId: string; releaseWindowId: string }) {
  return invokeEdgeFunction<{ success: true }>("office-release-windows", {
    method: "DELETE",
    sessionToken: requireSessionToken(),
    body: input,
  });
}

export async function createOfficeBooking(input: CreateOfficeBookingInput) {
  return invokeEdgeFunction<{ booking: OfficeBooking }>("office-bookings", {
    method: "POST",
    sessionToken: requireSessionToken(),
    body: input,
  });
}

export async function cancelOfficeBooking(input: { organizationId: string; bookingId: string }) {
  return invokeEdgeFunction<{ success: true }>("office-bookings", {
    method: "DELETE",
    sessionToken: requireSessionToken(),
    body: input,
  });
}
