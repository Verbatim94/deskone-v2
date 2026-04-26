import type { createClient } from "https://esm.sh/@supabase/supabase-js@2.84.0";

import { HttpError } from "./http.ts";

const SESSION_TTL_DAYS = 30;

function encodeHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function getClientIp(req: Request) {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (!forwardedFor) {
    return null;
  }

  return forwardedFor.split(",")[0]?.trim() || null;
}

export function getUserAgent(req: Request) {
  return req.headers.get("user-agent");
}

export function createRawSessionToken() {
  return encodeHex(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashSessionToken(sessionToken: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sessionToken));
  return encodeHex(new Uint8Array(digest));
}

export function getSessionExpiryDate() {
  return new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function extractBearerToken(req: Request) {
  const authorizationHeader = req.headers.get("authorization");

  if (!authorizationHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authorizationHeader.slice("Bearer ".length).trim() || null;
}

type SupabaseAdminClient = ReturnType<typeof createClient>;

type SessionUserRole = "super_admin" | "admin" | "user";

export type ActiveSession = {
  sessionId: string;
  userId: string;
  expiresAt: string;
  user: {
    id: string;
    username: string;
    fullName: string;
    role: SessionUserRole;
  };
};

export async function requireActiveSession(req: Request, supabase: SupabaseAdminClient): Promise<ActiveSession> {
  const sessionToken = extractBearerToken(req);

  if (!sessionToken) {
    throw new HttpError(401, "unauthorized", "Missing session token.");
  }

  const sessionTokenHash = await hashSessionToken(sessionToken);
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from("app_sessions")
    .select(
      `
        id,
        user_id,
        expires_at,
        revoked_at,
        session_version,
        app_users!inner (
          id,
          username,
          full_name,
          role,
          is_active,
          session_version
        )
      `,
    )
    .eq("session_token_hash", sessionTokenHash)
    .is("revoked_at", null)
    .gt("expires_at", nowIso)
    .single();

  if (
    error ||
    !data ||
    !data.app_users ||
    !data.app_users.is_active ||
    Number(data.session_version) !== Number(data.app_users.session_version)
  ) {
    throw new HttpError(401, "unauthorized", "Session is invalid or expired.");
  }

  return {
    sessionId: data.id as string,
    userId: data.user_id as string,
    expiresAt: data.expires_at as string,
    user: {
      id: data.app_users.id as string,
      username: data.app_users.username as string,
      fullName: data.app_users.full_name as string,
      role: data.app_users.role as SessionUserRole,
    },
  };
}
