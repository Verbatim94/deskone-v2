const HASH_PREFIX = "pbkdf2_sha256";
const PBKDF2_ITERATIONS = 310_000;
const SALT_LENGTH = 16;
const HASH_LENGTH = 32;
const MIN_PASSWORD_LENGTH = 12;

function textEncoder() {
  return new TextEncoder();
}

function encodeBase64Url(bytes: Uint8Array) {
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;

  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }

  return diff === 0;
}

async function deriveBits(password: string, salt: Uint8Array, iterations: number) {
  const keyMaterial = await crypto.subtle.importKey("raw", textEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations,
      salt,
    },
    keyMaterial,
    HASH_LENGTH * 8,
  );

  return new Uint8Array(derivedBits);
}

export function validatePasswordPolicy(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`;
  }

  if (!/[A-Za-z]/.test(password)) {
    return "Password must include at least one letter.";
  }

  if (!/\d/.test(password)) {
    return "Password must include at least one number.";
  }

  return null;
}

export async function createPasswordHash(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const hash = await deriveBits(password, salt, PBKDF2_ITERATIONS);
  return `${HASH_PREFIX}$${PBKDF2_ITERATIONS}$${encodeBase64Url(salt)}$${encodeBase64Url(hash)}`;
}

export async function verifyPassword(password: string, encodedHash: string) {
  const [algorithm, iterationsValue, saltValue, hashValue] = encodedHash.split("$");

  if (algorithm !== HASH_PREFIX || !iterationsValue || !saltValue || !hashValue) {
    return false;
  }

  const iterations = Number(iterationsValue);

  if (!Number.isFinite(iterations) || iterations <= 0) {
    return false;
  }

  const salt = decodeBase64Url(saltValue);
  const expectedHash = decodeBase64Url(hashValue);
  const actualHash = await deriveBits(password, salt, iterations);

  return timingSafeEqual(actualHash, expectedHash);
}
