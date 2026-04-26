import { requireSessionToken } from "@/features/auth/require-session-token";
import { invokeEdgeFunction } from "@/lib/api-client";
import type {
  CreateRoomReservationInput,
  RoomAvailabilityResponse,
  RoomBookingSegment,
  RoomOverviewResponse,
  RoomReservation,
} from "@/features/rooms/types";

export async function listAccessibleRooms(organizationId: string) {
  return invokeEdgeFunction<RoomOverviewResponse>("rooms-overview", {
    method: "GET",
    sessionToken: requireSessionToken(),
    query: { organizationId },
  });
}

export async function getRoomAvailability(input: {
  organizationId: string;
  roomId: string;
  date: string;
  segment: RoomBookingSegment;
}) {
  return invokeEdgeFunction<RoomAvailabilityResponse>("room-availability", {
    method: "GET",
    sessionToken: requireSessionToken(),
    query: input,
  });
}

export async function createRoomReservation(input: CreateRoomReservationInput) {
  const response = await invokeEdgeFunction<{
    reservation: RoomReservation;
  }>("room-reservations", {
    method: "POST",
    sessionToken: requireSessionToken(),
    body: input,
  });

  return response.reservation;
}

export async function cancelRoomReservation(input: { organizationId: string; reservationId: string }) {
  return invokeEdgeFunction<{ reservationId: string; cancelled: boolean }>("room-reservations", {
    method: "DELETE",
    sessionToken: requireSessionToken(),
    body: input,
  });
}
