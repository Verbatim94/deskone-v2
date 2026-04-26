import { HttpError } from "./http.ts";
import { getUserDirectory } from "./user-directory.ts";

type SupabaseAdminClient = ReturnType<typeof import("./supabase-admin.ts").createAdminClient>;

export type OrganizationMemberSummary = {
  userId: string;
  username: string;
  role: "super_admin" | "admin" | "user";
  membershipRole: "admin" | "member";
  isActive: boolean;
  fullName: string;
  displayName: string;
  email: string | null;
};

export type OrganizationRoomSummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  gridWidth: number;
  gridHeight: number;
  isActive: boolean;
};

export type OrganizationGroupSummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
};

export type OrganizationAmenitySummary = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeRequiredName(fieldName: string, value: unknown, maxLength = 120) {
  if (typeof value !== "string") {
    throw new HttpError(400, "bad_request", `${fieldName} is required.`);
  }

  const normalized = normalizeWhitespace(value);

  if (!normalized || normalized.length > maxLength) {
    throw new HttpError(
      400,
      "bad_request",
      `${fieldName} must be between 1 and ${maxLength} characters.`,
    );
  }

  return normalized;
}

export function normalizeOptionalText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeWhitespace(value);

  if (!normalized) {
    return null;
  }

  if (normalized.length > maxLength) {
    throw new HttpError(400, "bad_request", `Field exceeds the ${maxLength} character limit.`);
  }

  return normalized;
}

export function normalizeSlug(value: unknown, fallbackName?: string, maxLength = 80) {
  const baseValue =
    typeof value === "string" && value.trim()
      ? value
      : typeof fallbackName === "string"
        ? fallbackName
        : "";

  const normalized = baseValue
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!normalized || normalized.length > maxLength || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    throw new HttpError(400, "bad_request", "Slug format is invalid.");
  }

  return normalized;
}

export function normalizePositiveInteger(
  fieldName: string,
  value: unknown,
  minValue: number,
  maxValue: number,
) {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isInteger(parsed) || parsed < minValue || parsed > maxValue) {
    throw new HttpError(
      400,
      "bad_request",
      `${fieldName} must be an integer between ${minValue} and ${maxValue}.`,
    );
  }

  return parsed;
}

export async function listOrganizationMembers(
  supabase: SupabaseAdminClient,
  organizationId: string,
): Promise<OrganizationMemberSummary[]> {
  const { data: memberships, error: membershipsError } = await supabase
    .from("organization_memberships")
    .select("user_id, role")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (membershipsError) {
    throw new HttpError(500, "internal_error", "Failed to load organization members.", membershipsError.message);
  }

  const userIds = Array.from(new Set((memberships ?? []).map((membership) => membership.user_id as string)));

  if (!userIds.length) {
    return [];
  }

  const [{ data: users, error: usersError }, directory] = await Promise.all([
    supabase.from("app_users").select("id, username, role, is_active, full_name").in("id", userIds),
    getUserDirectory(supabase, userIds),
  ]);

  if (usersError) {
    throw new HttpError(500, "internal_error", "Failed to load organization users.", usersError.message);
  }

  const membershipByUserId = new Map(
    (memberships ?? []).map((membership) => [
      membership.user_id as string,
      membership.role as "admin" | "member",
    ]),
  );

  return (users ?? [])
    .map((user) => ({
      userId: user.id as string,
      username: user.username as string,
      role: user.role as "super_admin" | "admin" | "user",
      membershipRole: membershipByUserId.get(user.id as string) ?? "member",
      isActive: user.is_active as boolean,
      fullName: user.full_name as string,
      displayName: directory[user.id as string]?.displayName ?? (user.full_name as string),
      email: directory[user.id as string]?.email ?? null,
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}

export async function listOrganizationRoomsBasic(
  supabase: SupabaseAdminClient,
  organizationId: string,
): Promise<OrganizationRoomSummary[]> {
  const { data, error } = await supabase
    .from("rooms")
    .select("id, name, slug, description, grid_width, grid_height, is_active")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new HttpError(500, "internal_error", "Failed to load organization rooms.", error.message);
  }

  return (data ?? []).map((room) => ({
    id: room.id as string,
    name: room.name as string,
    slug: room.slug as string,
    description: (room.description as string | null | undefined) ?? null,
    gridWidth: room.grid_width as number,
    gridHeight: room.grid_height as number,
    isActive: room.is_active as boolean,
  }));
}

export async function listOrganizationGroupsBasic(
  supabase: SupabaseAdminClient,
  organizationId: string,
): Promise<OrganizationGroupSummary[]> {
  const { data, error } = await supabase
    .from("sharing_groups")
    .select("id, name, slug, description")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });

  if (error) {
    throw new HttpError(500, "internal_error", "Failed to load organization groups.", error.message);
  }

  return (data ?? []).map((group) => ({
    id: group.id as string,
    name: group.name as string,
    slug: group.slug as string,
    description: (group.description as string | null | undefined) ?? null,
  }));
}

export async function assertOrganizationUserIds(
  supabase: SupabaseAdminClient,
  organizationId: string,
  userIds: string[],
) {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));

  if (!uniqueUserIds.length) {
    return;
  }

  const { data, error } = await supabase
    .from("organization_memberships")
    .select("user_id")
    .eq("organization_id", organizationId)
    .in("user_id", uniqueUserIds);

  if (error) {
    throw new HttpError(500, "internal_error", "Failed to validate organization users.", error.message);
  }

  const existingUserIds = new Set((data ?? []).map((row) => row.user_id as string));
  const missingUserIds = uniqueUserIds.filter((userId) => !existingUserIds.has(userId));

  if (missingUserIds.length) {
    throw new HttpError(400, "bad_request", "Some users are outside the active organization.", {
      missingUserIds,
    });
  }
}

export async function assertOrganizationRoomIds(
  supabase: SupabaseAdminClient,
  organizationId: string,
  roomIds: string[],
) {
  const uniqueRoomIds = Array.from(new Set(roomIds.filter(Boolean)));

  if (!uniqueRoomIds.length) {
    return;
  }

  const { data, error } = await supabase
    .from("rooms")
    .select("id")
    .eq("organization_id", organizationId)
    .in("id", uniqueRoomIds);

  if (error) {
    throw new HttpError(500, "internal_error", "Failed to validate organization rooms.", error.message);
  }

  const existingRoomIds = new Set((data ?? []).map((row) => row.id as string));
  const missingRoomIds = uniqueRoomIds.filter((roomId) => !existingRoomIds.has(roomId));

  if (missingRoomIds.length) {
    throw new HttpError(400, "bad_request", "Some rooms are outside the active organization.", {
      missingRoomIds,
    });
  }
}

export async function assertOrganizationGroupIds(
  supabase: SupabaseAdminClient,
  organizationId: string,
  groupIds: string[],
) {
  const uniqueGroupIds = Array.from(new Set(groupIds.filter(Boolean)));

  if (!uniqueGroupIds.length) {
    return;
  }

  const { data, error } = await supabase
    .from("sharing_groups")
    .select("id")
    .eq("organization_id", organizationId)
    .in("id", uniqueGroupIds);

  if (error) {
    throw new HttpError(500, "internal_error", "Failed to validate organization groups.", error.message);
  }

  const existingGroupIds = new Set((data ?? []).map((row) => row.id as string));
  const missingGroupIds = uniqueGroupIds.filter((groupId) => !existingGroupIds.has(groupId));

  if (missingGroupIds.length) {
    throw new HttpError(400, "bad_request", "Some groups are outside the active organization.", {
      missingGroupIds,
    });
  }
}

export async function listOrganizationAmenities(
  supabase: SupabaseAdminClient,
  organizationId: string,
): Promise<OrganizationAmenitySummary[]> {
  const { data, error } = await supabase
    .from("amenities")
    .select("id, name, slug, description, icon")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });

  if (error) {
    throw new HttpError(500, "internal_error", "Failed to load amenity catalog.", error.message);
  }

  return (data ?? []).map((amenity) => ({
    id: amenity.id as string,
    name: amenity.name as string,
    slug: amenity.slug as string,
    description: (amenity.description as string | null | undefined) ?? null,
    icon: (amenity.icon as string | null | undefined) ?? null,
  }));
}

export async function ensureOrganizationAmenities(
  supabase: SupabaseAdminClient,
  organizationId: string,
  amenityNames: string[],
) {
  const uniqueAmenityNames = Array.from(
    new Set(
      amenityNames
        .map((name) => normalizeOptionalText(name, 80))
        .filter((name): name is string => Boolean(name)),
    ),
  );

  if (!uniqueAmenityNames.length) {
    return new Map<string, string>();
  }

  const slugByName = new Map(
    uniqueAmenityNames.map((name) => [name, normalizeSlug(name, undefined, 120)]),
  );

  const slugs = Array.from(slugByName.values());

  const { data: existingAmenities, error: existingAmenitiesError } = await supabase
    .from("amenities")
    .select("id, name, slug")
    .eq("organization_id", organizationId)
    .in("slug", slugs);

  if (existingAmenitiesError) {
    throw new HttpError(500, "internal_error", "Failed to load amenity catalog.", existingAmenitiesError.message);
  }

  const amenityIdBySlug = new Map(
    (existingAmenities ?? []).map((amenity) => [amenity.slug as string, amenity.id as string]),
  );

  const amenitiesToCreate = uniqueAmenityNames.filter((name) => !amenityIdBySlug.has(slugByName.get(name)!));

  if (amenitiesToCreate.length) {
    const { data: insertedAmenities, error: insertAmenitiesError } = await supabase
      .from("amenities")
      .insert(
        amenitiesToCreate.map((name) => ({
          organization_id: organizationId,
          name,
          slug: slugByName.get(name)!,
        })),
      )
      .select("id, name, slug");

    if (insertAmenitiesError) {
      throw new HttpError(500, "internal_error", "Failed to create amenities.", insertAmenitiesError.message);
    }

    for (const amenity of insertedAmenities ?? []) {
      amenityIdBySlug.set(amenity.slug as string, amenity.id as string);
    }
  }

  return new Map(uniqueAmenityNames.map((name) => [name, amenityIdBySlug.get(slugByName.get(name)!)!]));
}
