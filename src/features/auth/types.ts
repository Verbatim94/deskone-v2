export type AppRole = "super_admin" | "admin" | "user";
export type OrganizationMembershipRole = "admin" | "member";
export type IdentityProviderKey = "local" | "entra";

export type IdentityProviderDescriptor = {
  key: IdentityProviderKey;
  label: string;
  status: "active" | "planned";
  signInMode: "password" | "oidc";
  canProvisionUsers: boolean;
  canSyncGroups: boolean;
  canUseScim: boolean;
};

export type SessionIdentity = {
  provider: IdentityProviderKey;
  providerSubject: string;
  providerTenantId: string | null;
  loginIdentifier: string | null;
  email: string | null;
  isPrimary: boolean;
  lastSyncedAt: string | null;
};

export type OrganizationSummary = {
  id: string;
  name: string;
  slug: string;
  membershipRole: OrganizationMembershipRole;
};

export type SessionUser = {
  id: string;
  username: string;
  role: AppRole;
  fullName: string;
  displayName: string;
  email: string | null;
  primaryIdentityProvider: IdentityProviderKey;
  identities: SessionIdentity[];
};

export type LoginInput = {
  username: string;
  password: string;
};

export type LoginResponse = {
  sessionToken: string;
  expiresAt: string;
  identityProviders: IdentityProviderDescriptor[];
  user: SessionUser;
  organizations: OrganizationSummary[];
};

export type SessionResponse = {
  sessionId: string;
  expiresAt: string;
  identityProviders: IdentityProviderDescriptor[];
  user: SessionUser;
  organizations: OrganizationSummary[];
};
