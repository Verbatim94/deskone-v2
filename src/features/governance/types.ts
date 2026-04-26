import type { AppRole, OrganizationMembershipRole } from "@/features/auth/types";

export type GovernanceOrganizationAdmin = {
  userId: string;
  displayName: string;
  email: string | null;
};

export type GovernanceOrganization = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  adminCount: number;
  memberCount: number;
  administrators: GovernanceOrganizationAdmin[];
};

export type GovernanceUserProfile = {
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  email: string | null;
  employeeCode: string | null;
  department: string | null;
  jobTitle: string | null;
  location: string | null;
  phone: string | null;
  timezone: string | null;
  notes: string | null;
  avatarUrl: string | null;
};

export type GovernanceUserMembership = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: OrganizationMembershipRole;
};

export type GovernanceUserIdentity = {
  provider: string;
  providerSubject: string;
  providerTenantId: string | null;
  loginIdentifier: string | null;
  email: string | null;
  isPrimary: boolean;
  lastSyncedAt: string | null;
};

export type GovernanceUser = {
  id: string;
  username: string;
  role: AppRole;
  fullName: string;
  isActive: boolean;
  loginEnabled: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  profile: GovernanceUserProfile;
  memberships: GovernanceUserMembership[];
  identities: GovernanceUserIdentity[];
};

export type GovernanceIssuedCredentials = {
  temporaryPassword: string;
  mustChangePassword: boolean;
};

export type GovernanceMembershipInput = {
  organizationId: string;
  role: OrganizationMembershipRole;
};

export type CreateOrganizationInput = {
  name: string;
  slug?: string;
  description?: string | null;
  adminUserIds?: string[];
  memberUserIds?: string[];
};

export type UpdateOrganizationInput = {
  organizationId: string;
  name?: string;
  slug?: string;
  description?: string | null;
  isActive?: boolean;
  adminUserIds?: string[];
  memberUserIds?: string[];
};

export type CreateUserInput = {
  username: string;
  password?: string;
  role: Exclude<AppRole, "super_admin">;
  loginEnabled?: boolean;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  email?: string | null;
  employeeCode?: string | null;
  department?: string | null;
  jobTitle?: string | null;
  location?: string | null;
  phone?: string | null;
  timezone?: string | null;
  notes?: string | null;
  avatarUrl?: string | null;
  memberships?: GovernanceMembershipInput[];
};

export type UpdateUserInput = {
  userId: string;
  username?: string;
  password?: string;
  issueTemporaryPassword?: boolean;
  role?: Exclude<AppRole, "super_admin">;
  isActive?: boolean;
  loginEnabled?: boolean;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  email?: string | null;
  employeeCode?: string | null;
  department?: string | null;
  jobTitle?: string | null;
  location?: string | null;
  phone?: string | null;
  timezone?: string | null;
  notes?: string | null;
  avatarUrl?: string | null;
  memberships?: GovernanceMembershipInput[];
};
