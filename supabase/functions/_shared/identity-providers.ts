export type IdentityProviderKey = "local" | "entra";

type SupabaseAdminClient = ReturnType<typeof import("./supabase-admin.ts").createAdminClient>;

export type SessionIdentitySummary = {
  provider: IdentityProviderKey;
  providerSubject: string;
  providerTenantId: string | null;
  loginIdentifier: string | null;
  email: string | null;
  isPrimary: boolean;
  lastSyncedAt: string | null;
};

export type IdentityProviderDescriptor = {
  key: IdentityProviderKey;
  label: string;
  status: "active" | "planned";
  signInMode: "password" | "oidc";
  canProvisionUsers: boolean;
  canSyncGroups: boolean;
  canUseScim: boolean;
};

const PROVIDER_CATALOG: Record<IdentityProviderKey, IdentityProviderDescriptor> = {
  local: {
    key: "local",
    label: "Deskone Local Auth",
    status: "active",
    signInMode: "password",
    canProvisionUsers: false,
    canSyncGroups: false,
    canUseScim: false,
  },
  entra: {
    key: "entra",
    label: "Microsoft Entra ID",
    status: "planned",
    signInMode: "oidc",
    canProvisionUsers: true,
    canSyncGroups: true,
    canUseScim: true,
  },
};

export function listSupportedIdentityProviders() {
  return Object.values(PROVIDER_CATALOG);
}

export async function listUserIdentitySummaries(
  supabase: SupabaseAdminClient,
  userId: string,
): Promise<SessionIdentitySummary[]> {
  const { data: identities, error } = await supabase
    .from("user_identities")
    .select("provider, provider_subject, provider_tenant_id, login_identifier, email, is_primary, last_synced_at")
    .eq("user_id", userId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load user identities: ${error.message}`);
  }

  return (identities ?? []).map((identity) => ({
    provider: identity.provider as IdentityProviderKey,
    providerSubject: identity.provider_subject as string,
    providerTenantId: (identity.provider_tenant_id as string | null | undefined) ?? null,
    loginIdentifier: (identity.login_identifier as string | null | undefined) ?? null,
    email: (identity.email as string | null | undefined) ?? null,
    isPrimary: Boolean(identity.is_primary),
    lastSyncedAt: (identity.last_synced_at as string | null | undefined) ?? null,
  }));
}

export function resolvePrimaryIdentityProvider(identities: SessionIdentitySummary[]): IdentityProviderKey {
  return identities.find((identity) => identity.isPrimary)?.provider ?? "local";
}
