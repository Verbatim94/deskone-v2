type SupabaseAdminClient = ReturnType<typeof import("./supabase-admin.ts").createAdminClient>;

export type UserDirectoryEntry = {
  fullName: string;
  displayName: string;
  email: string | null;
};

export async function getUserDirectory(
  supabase: SupabaseAdminClient,
  userIds: string[],
): Promise<Record<string, UserDirectoryEntry>> {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));

  if (!uniqueUserIds.length) {
    return {};
  }

  const [{ data: users, error: usersError }, { data: profiles, error: profilesError }] = await Promise.all([
    supabase.from("app_users").select("id, full_name").in("id", uniqueUserIds),
    supabase.from("user_profiles").select("user_id, display_name, email").in("user_id", uniqueUserIds),
  ]);

  if (usersError) {
    throw new Error(`Failed to load user directory: ${usersError.message}`);
  }

  if (profilesError) {
    throw new Error(`Failed to load user profiles: ${profilesError.message}`);
  }

  const profileByUserId = new Map(
    (profiles ?? []).map((profile) => [
      profile.user_id as string,
      {
        displayName: (profile.display_name as string | null | undefined) ?? null,
        email: (profile.email as string | null | undefined) ?? null,
      },
    ]),
  );

  return Object.fromEntries(
    (users ?? []).map((user) => {
      const profile = profileByUserId.get(user.id as string);
      const fullName = user.full_name as string;

      return [
        user.id as string,
        {
          fullName,
          displayName: profile?.displayName ?? fullName,
          email: profile?.email ?? null,
        },
      ];
    }),
  );
}
