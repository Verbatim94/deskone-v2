import { HttpError } from "./http.ts";

type SupabaseAdminClient = ReturnType<typeof import("./supabase-admin.ts").createAdminClient>;

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_BLOCK_MS = 30 * 60 * 1000;
const USERNAME_MAX_ATTEMPTS = 6;
const IP_MAX_ATTEMPTS = 20;

function encodeHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return encodeHex(new Uint8Array(digest));
}

async function buildScope(scopeType: "login_username" | "login_ip", rawValue: string) {
  const hash = await sha256Hex(rawValue.trim().toLowerCase());
  return {
    scopeKey: `${scopeType}:${hash}`,
    scopeType,
    scopeIdentifierHash: hash,
  };
}

async function assertScopeNotBlocked(supabase: SupabaseAdminClient, scopeKey: string) {
  const { data, error } = await supabase
    .from("auth_rate_limits")
    .select("blocked_until")
    .eq("scope_key", scopeKey)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "internal_error", "Failed to evaluate login security policy.", error.message);
  }

  if (data?.blocked_until && new Date(data.blocked_until).getTime() > Date.now()) {
    throw new HttpError(429, "too_many_requests", "Too many login attempts. Please wait and try again.");
  }
}

async function registerScopeFailure(
  supabase: SupabaseAdminClient,
  scope: {
    scopeKey: string;
    scopeType: "login_username" | "login_ip";
    scopeIdentifierHash: string;
  },
  maxAttempts: number,
) {
  const now = new Date();
  const { data, error } = await supabase
    .from("auth_rate_limits")
    .select("attempt_count, window_started_at, blocked_until")
    .eq("scope_key", scope.scopeKey)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "internal_error", "Failed to register login attempt.", error.message);
  }

  const withinWindow =
    data?.window_started_at && now.getTime() - new Date(data.window_started_at).getTime() < LOGIN_WINDOW_MS;

  const nextAttemptCount = withinWindow ? Number(data?.attempt_count ?? 0) + 1 : 1;
  const blockedUntil =
    nextAttemptCount >= maxAttempts ? new Date(now.getTime() + LOGIN_BLOCK_MS).toISOString() : null;

  const { error: upsertError } = await supabase.from("auth_rate_limits").upsert({
    scope_key: scope.scopeKey,
    scope_type: scope.scopeType,
    scope_identifier_hash: scope.scopeIdentifierHash,
    attempt_count: nextAttemptCount,
    window_started_at: withinWindow ? data?.window_started_at : now.toISOString(),
    last_attempt_at: now.toISOString(),
    blocked_until: blockedUntil,
  });

  if (upsertError) {
    throw new HttpError(500, "internal_error", "Failed to persist login security state.", upsertError.message);
  }
}

async function clearScope(supabase: SupabaseAdminClient, scopeKey: string) {
  const { error } = await supabase.from("auth_rate_limits").delete().eq("scope_key", scopeKey);

  if (error) {
    throw new HttpError(500, "internal_error", "Failed to clear login security state.", error.message);
  }
}

export async function assertLoginRateLimit(
  supabase: SupabaseAdminClient,
  input: { username: string; clientIp: string | null },
) {
  const usernameScope = await buildScope("login_username", input.username);
  await assertScopeNotBlocked(supabase, usernameScope.scopeKey);

  if (input.clientIp) {
    const ipScope = await buildScope("login_ip", input.clientIp);
    await assertScopeNotBlocked(supabase, ipScope.scopeKey);
  }
}

export async function registerLoginFailure(
  supabase: SupabaseAdminClient,
  input: { username: string; clientIp: string | null },
) {
  const usernameScope = await buildScope("login_username", input.username);
  await registerScopeFailure(supabase, usernameScope, USERNAME_MAX_ATTEMPTS);

  if (input.clientIp) {
    const ipScope = await buildScope("login_ip", input.clientIp);
    await registerScopeFailure(supabase, ipScope, IP_MAX_ATTEMPTS);
  }
}

export async function clearLoginFailures(
  supabase: SupabaseAdminClient,
  input: { username: string; clientIp: string | null },
) {
  const usernameScope = await buildScope("login_username", input.username);
  await clearScope(supabase, usernameScope.scopeKey);

  if (input.clientIp) {
    const ipScope = await buildScope("login_ip", input.clientIp);
    await clearScope(supabase, ipScope.scopeKey);
  }
}
