import type { AppRole, OrganizationMembershipRole, OrganizationSummary } from "@/features/auth/types";

export type StudioOrganizationScope = OrganizationSummary;

export type StudioRoomSummary = {
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
  adminCount: number;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
};

export type StudioRoomOption = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  gridWidth: number;
  gridHeight: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StudioOrganizationMember = {
  userId: string;
  username: string;
  role: AppRole;
  membershipRole: OrganizationMembershipRole;
  isActive: boolean;
  fullName: string;
  displayName: string;
  email: string | null;
};

export type StudioGroupOption = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
};

export type StudioSharingGroupMember = {
  userId: string;
  username: string | null;
  displayName: string;
  email: string | null;
};

export type StudioSharingGroupRoomAccess = {
  roomId: string;
  roomName: string;
  roomSlug: string;
  role: OrganizationMembershipRole;
};

export type StudioSharingGroup = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  members: StudioSharingGroupMember[];
  roomAccess: StudioSharingGroupRoomAccess[];
};

export type StudioAmenity = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
};

export type StudioDeskStatus = "available" | "restricted";

export type StudioRoomDesk = {
  id: string;
  label: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDegrees: number;
  zIndex: number;
  defaultStatus: StudioDeskStatus;
  amenities: string[];
};

export type StudioRoomZone = {
  id: string;
  name: string;
  zoneType: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string | null;
};

export type StudioRoomWall = {
  id: string;
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
  orientation: "horizontal" | "vertical";
  type: "wall" | "entrance";
};

export type StudioRoomUserAccess = {
  userId: string;
  username: string;
  displayName: string;
  email: string | null;
  role: OrganizationMembershipRole;
};

export type StudioRoomGroupAccess = {
  groupId: string;
  groupName: string;
  groupSlug: string;
  role: OrganizationMembershipRole;
};

export type StudioRoomRecord = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  gridWidth: number;
  gridHeight: number;
  isActive: boolean;
  updatedAt: string;
};

export type StudioRoomLayout = {
  room: StudioRoomRecord;
  desks: StudioRoomDesk[];
  zones: StudioRoomZone[];
  walls: StudioRoomWall[];
  roomUserAccess: StudioRoomUserAccess[];
  roomGroupAccess: StudioRoomGroupAccess[];
  organizationMembers: StudioOrganizationMember[];
  organizationGroups: StudioGroupOption[];
  amenityCatalog: StudioAmenity[];
};

export type CreateStudioRoomInput = {
  organizationId: string;
  name: string;
  slug?: string;
  description?: string | null;
  gridWidth?: number;
  gridHeight?: number;
};

export type StudioRoomAccessInput = {
  roomId: string;
  role: OrganizationMembershipRole;
};

export type CreateStudioSharingGroupInput = {
  organizationId: string;
  name: string;
  slug?: string;
  description?: string | null;
  memberUserIds?: string[];
  roomAccess?: StudioRoomAccessInput[];
};

export type UpdateStudioSharingGroupInput = CreateStudioSharingGroupInput & {
  groupId: string;
};

export type SaveStudioRoomLayoutInput = {
  organizationId: string;
  roomId: string;
  room: {
    name: string;
    slug?: string;
    description?: string | null;
    gridWidth: number;
    gridHeight: number;
    isActive: boolean;
  };
  desks: StudioRoomDesk[];
  zones: StudioRoomZone[];
  roomUserAccess: Array<{
    userId: string;
    role: OrganizationMembershipRole;
  }>;
  roomGroupAccess: Array<{
    groupId: string;
    role: OrganizationMembershipRole;
  }>;
};
