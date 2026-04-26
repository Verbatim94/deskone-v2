import { invokeEdgeFunction } from "@/lib/api-client";
import { requireSessionToken } from "@/features/auth/require-session-token";
import type {
  CreateOrganizationInput,
  CreateUserInput,
  GovernanceIssuedCredentials,
  GovernanceOrganization,
  GovernanceUser,
  UpdateOrganizationInput,
  UpdateUserInput,
} from "@/features/governance/types";

export async function listGovernanceOrganizations(includeInactive = false) {
  const response = await invokeEdgeFunction<{ organizations: GovernanceOrganization[] }>("governance-organizations", {
    method: "GET",
    sessionToken: requireSessionToken(),
    query: {
      includeInactive,
    },
  });

  return response.organizations;
}

export async function createGovernanceOrganization(input: CreateOrganizationInput) {
  const response = await invokeEdgeFunction<{ organization: GovernanceOrganization }>("governance-organizations", {
    method: "POST",
    sessionToken: requireSessionToken(),
    body: input,
  });

  return response.organization;
}

export async function updateGovernanceOrganization(input: UpdateOrganizationInput) {
  const response = await invokeEdgeFunction<{ organization: GovernanceOrganization }>("governance-organizations", {
    method: "PATCH",
    sessionToken: requireSessionToken(),
    body: input,
  });

  return response.organization;
}

export async function listGovernanceUsers(filters: {
  organizationId?: string;
  role?: GovernanceUser["role"];
  isActive?: boolean;
  search?: string;
} = {}) {
  const response = await invokeEdgeFunction<{ users: GovernanceUser[] }>("governance-users", {
    method: "GET",
    sessionToken: requireSessionToken(),
    query: filters,
  });

  return response.users;
}

export async function createGovernanceUser(input: CreateUserInput) {
  const response = await invokeEdgeFunction<{ user: GovernanceUser }>("governance-users", {
    method: "POST",
    sessionToken: requireSessionToken(),
    body: input,
  });

  return response.user;
}

export async function updateGovernanceUser(input: UpdateUserInput) {
  const response = await invokeEdgeFunction<{ user: GovernanceUser }>("governance-users", {
    method: "PATCH",
    sessionToken: requireSessionToken(),
    body: input,
  });

  return response.user;
}

export async function issueGovernanceUserAccess(userId: string) {
  const response = await invokeEdgeFunction<{
    user: GovernanceUser;
    issuedCredentials: GovernanceIssuedCredentials | null;
  }>("governance-users", {
    method: "PATCH",
    sessionToken: requireSessionToken(),
    body: {
      userId,
      issueTemporaryPassword: true,
    },
  });

  return response;
}
