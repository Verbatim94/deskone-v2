import { HttpError } from "./http.ts";
import type { OrganizationScope } from "./organizations.ts";

type SupabaseAdminClient = ReturnType<typeof import("./supabase-admin.ts").createAdminClient>;

type SessionUser = {
  id: string;
  role: "super_admin" | "admin" | "user";
};

export type AccessibleRoomScope = {
  roomId: string;
  accessRole: "admin" | "member";
};

function mergeRole(currentRole: "admin" | "member" | undefined, nextRole: "admin" | "member") {
  if (currentRole === "admin" || nextRole === "admin") {
    return "admin";
  }

  return "member";
}

export async function listAccessibleRoomScopes(
  supabase: SupabaseAdminClient,
  organization: OrganizationScope,
  user: SessionUser,
): Promise<AccessibleRoomScope[]> {
  if (user.role === "super_admin" || organization.membershipRole === "admin") {
    const { data, error } = await supabase
      .from("rooms")
      .select("id")
      .eq("organization_id", organization.id)
      .eq("is_active", true);

    if (error) {
      throw new HttpError(500, "internal_error", "Failed to load organization rooms.", error.message);
    }

    return (data ?? []).map((room) => ({
      roomId: room.id as string,
      accessRole: "admin" as const,
    }));
  }

  const [directMembershipsResult, groupMembershipsResult] = await Promise.all([
    supabase
      .from("room_memberships")
      .select("role, room:rooms!inner(id, organization_id, is_active)")
      .eq("user_id", user.id),
    supabase
      .from("sharing_group_memberships")
      .select("group_id")
      .eq("user_id", user.id),
  ]);

  const { data: directMemberships, error: directMembershipsError } = directMembershipsResult;
  const { data: groupMemberships, error: groupMembershipsError } = groupMembershipsResult;

  if (directMembershipsError || groupMembershipsError) {
    throw new HttpError(
      500,
      "internal_error",
      "Failed to resolve room access.",
      directMembershipsError?.message || groupMembershipsError?.message,
    );
  }

  const roleByRoomId = new Map<string, "admin" | "member">();

  for (const membership of directMemberships ?? []) {
    if (
      membership.room?.organization_id !== organization.id ||
      membership.room?.is_active !== true
    ) {
      continue;
    }

    const roomId = membership.room.id as string;
    roleByRoomId.set(roomId, mergeRole(roleByRoomId.get(roomId), membership.role as "admin" | "member"));
  }

  const groupIds = Array.from(new Set((groupMemberships ?? []).map((membership) => membership.group_id as string)));
  const { data: groupRoomAccessRows, error: groupRoomAccessError } = groupIds.length
    ? await supabase
        .from("room_group_memberships")
        .select("group_id, role, room:rooms!inner(id, organization_id, is_active)")
        .in("group_id", groupIds)
    : { data: [], error: null };

  if (groupRoomAccessError) {
    throw new HttpError(500, "internal_error", "Failed to resolve room access.", groupRoomAccessError.message);
  }

  for (const roomAccess of groupRoomAccessRows ?? []) {
    if (
      roomAccess.room?.organization_id !== organization.id ||
      roomAccess.room?.is_active !== true
    ) {
      continue;
    }

    const roomId = roomAccess.room.id as string;
    roleByRoomId.set(roomId, mergeRole(roleByRoomId.get(roomId), roomAccess.role as "admin" | "member"));
  }

  return Array.from(roleByRoomId.entries()).map(([roomId, accessRole]) => ({
    roomId,
    accessRole,
  }));
}

export async function requireRoomScope(
  supabase: SupabaseAdminClient,
  organization: OrganizationScope,
  user: SessionUser,
  roomId: string,
): Promise<AccessibleRoomScope> {
  const roomScopes = await listAccessibleRoomScopes(supabase, organization, user);
  const roomScope = roomScopes.find((entry) => entry.roomId === roomId);

  if (!roomScope) {
    throw new HttpError(403, "forbidden", "Missing room scope.");
  }

  return roomScope;
}

export function normalizeDateOnly(fieldName: string, value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    throw new HttpError(400, "bad_request", `${fieldName} must use YYYY-MM-DD format.`);
  }

  return value.trim();
}

export function normalizeTimeSegment(value: unknown) {
  if (value === "am" || value === "pm") {
    return value;
  }

  return "full" as const;
}

export function overlapsSegment(
  requestedSegment: "full" | "am" | "pm",
  existingSegment: "full" | "am" | "pm",
) {
  if (requestedSegment === "full" || existingSegment === "full") {
    return true;
  }

  return requestedSegment === existingSegment;
}
