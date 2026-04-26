import { requireSessionToken } from "@/features/auth/require-session-token";
import { invokeEdgeFunction } from "@/lib/api-client";
import type {
  CreateStudioRoomInput,
  CreateStudioSharingGroupInput,
  SaveStudioRoomLayoutInput,
  StudioOrganizationMember,
  StudioOrganizationScope,
  StudioRoomLayout,
  StudioRoomOption,
  StudioRoomSummary,
  StudioSharingGroup,
  UpdateStudioSharingGroupInput,
} from "@/features/admin-studio/types";

type StudioGroupsResponse = {
  organization: StudioOrganizationScope;
  availableUsers: StudioOrganizationMember[];
  availableRooms: StudioRoomOption[];
  groups: StudioSharingGroup[];
};

export async function listStudioRooms(organizationId: string) {
  const response = await invokeEdgeFunction<{
    organization: StudioOrganizationScope;
    rooms: StudioRoomSummary[];
  }>("organization-admin-rooms", {
    method: "GET",
    sessionToken: requireSessionToken(),
    query: { organizationId },
  });

  return response.rooms;
}

export async function createStudioRoom(input: CreateStudioRoomInput) {
  const response = await invokeEdgeFunction<{
    organization: StudioOrganizationScope;
    room: StudioRoomSummary;
  }>("organization-admin-rooms", {
    method: "POST",
    sessionToken: requireSessionToken(),
    body: input,
  });

  return response.room;
}

export async function getStudioSharingGroups(organizationId: string) {
  return invokeEdgeFunction<StudioGroupsResponse>("organization-admin-sharing-groups", {
    method: "GET",
    sessionToken: requireSessionToken(),
    query: { organizationId },
  });
}

export async function createStudioSharingGroup(input: CreateStudioSharingGroupInput) {
  const response = await invokeEdgeFunction<{
    organization: StudioOrganizationScope;
    group: StudioSharingGroup;
  }>("organization-admin-sharing-groups", {
    method: "POST",
    sessionToken: requireSessionToken(),
    body: input,
  });

  return response.group;
}

export async function updateStudioSharingGroup(input: UpdateStudioSharingGroupInput) {
  const response = await invokeEdgeFunction<{
    organization: StudioOrganizationScope;
    group: StudioSharingGroup;
  }>("organization-admin-sharing-groups", {
    method: "PATCH",
    sessionToken: requireSessionToken(),
    body: input,
  });

  return response.group;
}

export async function getStudioRoomLayout(organizationId: string, roomId: string) {
  return invokeEdgeFunction<StudioRoomLayout & { organization: StudioOrganizationScope }>(
    "organization-admin-room-layout",
    {
      method: "GET",
      sessionToken: requireSessionToken(),
      query: { organizationId, roomId },
    },
  );
}

export async function updateStudioRoomLayout(input: SaveStudioRoomLayoutInput) {
  return invokeEdgeFunction<StudioRoomLayout & { organization: StudioOrganizationScope }>(
    "organization-admin-room-layout",
    {
      method: "PUT",
      sessionToken: requireSessionToken(),
      body: input,
    },
  );
}
