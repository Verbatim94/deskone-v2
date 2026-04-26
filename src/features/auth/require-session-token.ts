import { readSessionToken } from "@/features/auth/session-store";

export function requireSessionToken() {
  const sessionToken = readSessionToken();

  if (!sessionToken) {
    throw new Error("Missing session token.");
  }

  return sessionToken;
}
