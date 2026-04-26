import { invokeEdgeFunction } from "@/lib/api-client";
import { clearActiveOrganizationId, clearSessionToken, persistSessionToken, readSessionToken } from "@/features/auth/session-store";
import type { ChangePasswordInput, LoginInput, LoginResponse, SessionResponse } from "@/features/auth/types";

export async function login(input: LoginInput) {
  const response = await invokeEdgeFunction<LoginResponse>("auth-login", {
    method: "POST",
    body: input,
  });

  persistSessionToken(response.sessionToken);
  return response;
}

export async function getActiveSession() {
  const sessionToken = readSessionToken();

  if (!sessionToken) {
    return null;
  }

  try {
    return await invokeEdgeFunction<SessionResponse>("auth-session", {
      method: "GET",
      sessionToken,
    });
  } catch {
    clearSessionToken();
    return null;
  }
}

export async function logout() {
  const sessionToken = readSessionToken();

  if (!sessionToken) {
    return;
  }

  try {
    await invokeEdgeFunction<void>("auth-logout", {
      method: "POST",
      sessionToken,
    });
  } finally {
    clearActiveOrganizationId();
    clearSessionToken();
  }
}

export async function revokeAllSessions() {
  const sessionToken = readSessionToken();

  if (!sessionToken) {
    return;
  }

  try {
    await invokeEdgeFunction<void>("auth-revoke-all", {
      method: "POST",
      sessionToken,
    });
  } finally {
    clearActiveOrganizationId();
    clearSessionToken();
  }
}

export async function changePassword(input: ChangePasswordInput) {
  const sessionToken = readSessionToken();

  if (!sessionToken) {
    throw new Error("Missing session token.");
  }

  await invokeEdgeFunction<{ ok: true }>("auth-change-password", {
    method: "POST",
    sessionToken,
    body: input,
  });
}
