import { requireSessionToken } from "@/features/auth/require-session-token";
import { invokeEdgeFunction } from "@/lib/api-client";

export type ScheduleRoomReservation = {
  id: string;
  roomId: string;
  roomName: string;
  roomSlug: string;
  deskId: string;
  deskLabel: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  segment: "full" | "am" | "pm";
  dateStart: string;
  dateEnd: string;
  notes: string | null;
  cancelledAt: string | null;
  createdAt: string;
};

export type ScheduleOfficeBooking = {
  id: string;
  officeId: string;
  officeName: string;
  officeSlug: string;
  floorLabel: string | null;
  locationLabel: string | null;
  status: "active" | "cancelled" | "completed";
  startsAt: string;
  endsAt: string;
  attendeeCount: number;
  note: string | null;
  cancelledAt: string | null;
  createdAt: string;
};

export type MyScheduleResponse = {
  organization: {
    id: string;
    name: string;
    slug: string;
    membershipRole: "admin" | "member";
  };
  roomReservations: ScheduleRoomReservation[];
  officeBookings: ScheduleOfficeBooking[];
};

export async function getMySchedule(input: {
  organizationId: string;
  fromDate: string;
  toDate: string;
}) {
  return invokeEdgeFunction<MyScheduleResponse>("my-schedule", {
    method: "GET",
    sessionToken: requireSessionToken(),
    query: input,
  });
}
