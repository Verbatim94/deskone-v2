const SESSION_TOKEN_KEY = "deskone-v2.session-token";
const ACTIVE_ORGANIZATION_KEY = "deskone-v2.active-organization-id";

export function readSessionToken() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(SESSION_TOKEN_KEY);
}

export function persistSessionToken(sessionToken: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SESSION_TOKEN_KEY, sessionToken);
}

export function clearSessionToken() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(SESSION_TOKEN_KEY);
}

export function readActiveOrganizationId() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(ACTIVE_ORGANIZATION_KEY);
}

export function persistActiveOrganizationId(organizationId: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ACTIVE_ORGANIZATION_KEY, organizationId);
}

export function clearActiveOrganizationId() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(ACTIVE_ORGANIZATION_KEY);
}
