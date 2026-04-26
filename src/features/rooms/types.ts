import type { OrganizationSummary } from "@/features/auth/types";

export type RoomAccessRole = "admin" | "member";
export type RoomDeskStatus = "available" | "reserved" | "yours" | "restricted";
export type RoomBookingSegment = "full" | "am" | "pm";

export type RoomSummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  gridWidth: number;
  gridHeight: number;
  isActive: boolean;
  deskCount: number;
  zoneCount: number;
  groupAccessCount: number;
  accessRole: RoomAccessRole;
  createdAt: string;
  updatedAt: string;
};

export type RoomOverviewResponse = {
  organization: OrganizationSummary;
  rooms: RoomSummary[];
};

export type RoomDesk = {
  id: string;
  label: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDegrees: number;
  zIndex: number;
  defaultStatus: "available" | "restricted";
  amenities: string[];
  status: RoomDeskStatus;
  occupantLabel: string | null;
  reservationId: string | null;
  reservationSegment: RoomBookingSegment | null;
};

export type RoomZone = {
  id: string;
  name: string;
  zoneType: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string | null;
};

export type CurrentUserReservation = {
  id: string;
  deskId: string;
  deskLabel: string | null;
  roomId: string;
  roomName: string;
  segment: RoomBookingSegment;
  status: "pending" | "approved";
  dateStart: string;
  dateEnd: string;
  notes: string | null;
};

export type RoomAvailabilityResponse = {
  organization: OrganizationSummary;
  roomScope: {
    roomId: string;
    accessRole: RoomAccessRole;
  };
  date: string;
  segment: RoomBookingSegment;
  room: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    gridWidth: number;
    gridHeight: number;
    isActive: boolean;
    updatedAt: string;
  };
  summary: {
    totalDesks: number;
    availableDesks: number;
    reservedDesks: number;
    restrictedDesks: number;
    yourDesks: number;
  };
  currentUserReservation: CurrentUserReservation | null;
  desks: RoomDesk[];
  zones: RoomZone[];
};

export type CreateRoomReservationInput = {
  organizationId: string;
  roomId: string;
  deskId: string;
  date: string;
  segment: RoomBookingSegment;
  notes?: string | null;
};

export type RoomReservation = {
  id: string;
  roomId: string;
  roomName: string;
  deskId: string;
  deskLabel: string | null;
  userId: string;
  status: "pending" | "approved";
  segment: RoomBookingSegment;
  dateStart: string;
  dateEnd: string;
  notes: string | null;
  createdAt: string;
};
