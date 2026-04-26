import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";

function getArg(flag, fallback = null) {
  const match = process.argv.find((argument) => argument.startsWith(`${flag}=`));
  return match ? match.slice(flag.length + 1) : fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function getActivationMode() {
  const mode = getArg("--activation-mode", "profile-only");

  if (mode !== "profile-only" && mode !== "temporary-passwords") {
    throw new Error("activation mode must be either profile-only or temporary-passwords");
  }

  return mode;
}

function requiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function splitFullName(fullName, username) {
  const normalized = String(fullName ?? "").trim() || username;
  const [firstName, ...rest] = normalized.split(/\s+/);
  return {
    firstName: firstName || username,
    lastName: rest.length ? rest.join(" ") : null,
    displayName: normalized,
  };
}

function createTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = randomBytes(16);
  let output = "Deskone!";

  for (const byte of bytes) {
    output += alphabet[byte % alphabet.length];
  }

  return output.slice(0, 20);
}

async function httpJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }

  return parsed;
}

async function fetchV1Users() {
  const v1Url = requiredEnv("V1_SUPABASE_URL");
  const v1Key = requiredEnv("V1_SUPABASE_PUBLISHABLE_KEY");

  return httpJson(
    `${v1Url}/rest/v1/users?select=id,username,full_name,role,is_active,password&order=username.asc`,
    {
      headers: {
        apikey: v1Key,
        Authorization: `Bearer ${v1Key}`,
      },
    },
  );
}

async function loginV2() {
  const v2Url = requiredEnv("V2_SUPABASE_URL");
  const v2Key = requiredEnv("V2_SUPABASE_PUBLISHABLE_KEY");
  const username = requiredEnv("V2_SUPERADMIN_USERNAME");
  const password = requiredEnv("V2_SUPERADMIN_PASSWORD");

  return httpJson(`${v2Url}/functions/v1/auth-login`, {
    method: "POST",
    headers: {
      apikey: v2Key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });
}

async function fetchV2Users(sessionToken) {
  const v2Url = requiredEnv("V2_SUPABASE_URL");
  const v2Key = requiredEnv("V2_SUPABASE_PUBLISHABLE_KEY");

  return httpJson(`${v2Url}/functions/v1/governance-users`, {
    method: "GET",
    headers: {
      apikey: v2Key,
      Authorization: `Bearer ${sessionToken}`,
    },
  });
}

async function createV2User(sessionToken, body) {
  const v2Url = requiredEnv("V2_SUPABASE_URL");
  const v2Key = requiredEnv("V2_SUPABASE_PUBLISHABLE_KEY");

  return httpJson(`${v2Url}/functions/v1/governance-users`, {
    method: "POST",
    headers: {
      apikey: v2Key,
      Authorization: `Bearer ${sessionToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function main() {
  const apply = hasFlag("--apply");
  const outputPath = resolve(getArg("--output", "tmp/v1-user-import-report.json"));
  const defaultOrganizationId = requiredEnv("V2_DEFAULT_ORGANIZATION_ID");
  const activationMode = getActivationMode();

  const [v1Users, loginResponse] = await Promise.all([fetchV1Users(), loginV2()]);
  const sessionToken = loginResponse.sessionToken;
  const existing = await fetchV2Users(sessionToken);
  const existingUsernames = new Set((existing.users ?? []).map((user) => String(user.username).toLowerCase()));

  const report = {
    importedAt: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    activationMode,
    totals: {
      sourceUsers: v1Users.length,
      existingUsers: existingUsernames.size,
      createdUsers: 0,
      skippedUsers: 0,
      inactiveUsers: 0,
    },
    created: [],
    skipped: [],
  };

  for (const sourceUser of v1Users) {
    const username = String(sourceUser.username).trim();
    const normalizedUsername = username.toLowerCase();

    if (!sourceUser.is_active) {
      report.totals.inactiveUsers += 1;
      report.totals.skippedUsers += 1;
      report.skipped.push({
        username,
        reason: "inactive_in_v1",
      });
      continue;
    }

    if (existingUsernames.has(normalizedUsername)) {
      report.totals.skippedUsers += 1;
      report.skipped.push({
        username,
        reason: "already_exists_in_v2",
      });
      continue;
    }

    const identity = splitFullName(sourceUser.full_name, username);
    const temporaryPassword = createTemporaryPassword();
    const role = sourceUser.role === "admin" ? "admin" : "user";
    const membershipRole = sourceUser.role === "admin" ? "admin" : "member";

    const payload = {
      username,
      role,
      loginEnabled: activationMode === "temporary-passwords",
      firstName: identity.firstName,
      lastName: identity.lastName,
      displayName: identity.displayName,
      email: null,
      employeeCode: null,
      department: null,
      jobTitle: null,
      location: null,
      phone: null,
      timezone: "Europe/Rome",
      notes: `Imported from v1 user ${sourceUser.id}. Legacy password not migrated because it does not satisfy the v2 password policy.`,
      memberships: [
        {
          organizationId: defaultOrganizationId,
          role: membershipRole,
        },
      ],
    };

    if (activationMode === "temporary-passwords") {
      payload.password = temporaryPassword;
    }

    if (apply) {
      const created = await createV2User(sessionToken, payload);
      report.created.push({
        sourceUserId: sourceUser.id,
        userId: created.user.id,
        username,
        role,
        membershipRole,
        temporaryPassword: activationMode === "temporary-passwords" ? temporaryPassword : null,
        loginEnabled: activationMode === "temporary-passwords",
      });
    } else {
      report.created.push({
        sourceUserId: sourceUser.id,
        username,
        role,
        membershipRole,
        temporaryPassword: activationMode === "temporary-passwords" ? temporaryPassword : null,
        loginEnabled: activationMode === "temporary-passwords",
      });
    }

    report.totals.createdUsers += 1;
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        outputPath,
        ...report.totals,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
