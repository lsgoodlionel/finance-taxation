import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Password hashing utilities built on Node's native scrypt (zero runtime
 * dependencies). Stored format is a PHC-like string so parameters travel with
 * the digest and can evolve without a schema change:
 *
 *   scrypt$<N>$<r>$<p>$<saltHex>$<keyHex>
 *
 * Legacy rows created before hashing was introduced hold the raw password in
 * `user_passwords.password_hash`. `verifyPassword` transparently accepts those
 * so the login path can lazily upgrade them (see `needsRehash`).
 */

const SCHEME = "scrypt";
// OWASP Password Storage baseline: N=2^17, r=8, p=1 (~128MB work factor).
const COST_N = 131072;
const BLOCK_SIZE_R = 8;
const PARALLELISM_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
// scrypt needs 128 * N * r bytes (≈128MB here); give headroom above that.
const MAX_MEM = 256 * 1024 * 1024;
// Upper bound on a stored N to keep a tampered/corrupt row from triggering a
// pathologically expensive scryptSync (defense-in-depth; stored values are DB-side).
const MAX_COST_N = 1 << 20;

export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(plain, salt, COST_N, BLOCK_SIZE_R, PARALLELISM_P);
  return [
    SCHEME,
    COST_N,
    BLOCK_SIZE_R,
    PARALLELISM_P,
    salt.toString("hex"),
    key.toString("hex")
  ].join("$");
}

export function isHashedPassword(stored: string): boolean {
  return typeof stored === "string" && stored.startsWith(`${SCHEME}$`);
}

/**
 * Verify a candidate password against a stored value. Returns `false` (never
 * throws) for malformed hashes so callers can treat any failure as a rejected
 * credential.
 */
export function verifyPassword(candidate: string, stored: string): boolean {
  if (typeof stored !== "string" || stored.length === 0) {
    return false;
  }

  if (!isHashedPassword(stored)) {
    // Legacy plaintext row: constant-time compare against the raw value.
    return safeEqualStrings(candidate, stored);
  }

  const parsed = parseHash(stored);
  if (!parsed) {
    return false;
  }

  try {
    const candidateKey = deriveKey(candidate, parsed.salt, parsed.n, parsed.r, parsed.p);
    if (candidateKey.length !== parsed.key.length) {
      return false;
    }
    return timingSafeEqual(candidateKey, parsed.key);
  } catch {
    return false;
  }
}

/**
 * True when the stored value should be re-hashed after a successful login —
 * either a legacy plaintext row or a hash produced with outdated parameters.
 */
export function needsRehash(stored: string): boolean {
  if (!isHashedPassword(stored)) {
    return true;
  }
  const parsed = parseHash(stored);
  if (!parsed) {
    return true;
  }
  return parsed.n !== COST_N || parsed.r !== BLOCK_SIZE_R || parsed.p !== PARALLELISM_P;
}

interface ParsedHash {
  n: number;
  r: number;
  p: number;
  salt: Buffer;
  key: Buffer;
}

function parseHash(stored: string): ParsedHash | null {
  const parts = stored.split("$");
  if (parts.length !== 6) {
    return null;
  }
  const [scheme, nRaw, rRaw, pRaw, saltRaw, keyRaw] = parts as [
    string,
    string,
    string,
    string,
    string,
    string
  ];
  if (scheme !== SCHEME) {
    return null;
  }
  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return null;
  }
  if (n < 2 || n > MAX_COST_N || r < 1 || p < 1) {
    return null;
  }
  const salt = hexToBuffer(saltRaw);
  const key = hexToBuffer(keyRaw);
  if (!salt || !key || salt.length === 0 || key.length === 0) {
    return null;
  }
  return { n, r, p, salt, key };
}

function deriveKey(plain: string, salt: Buffer, n: number, r: number, p: number): Buffer {
  return scryptSync(plain, salt, KEY_LENGTH, { N: n, r, p, maxmem: MAX_MEM });
}

function hexToBuffer(value: string): Buffer | null {
  if (!/^[0-9a-fA-F]+$/.test(value) || value.length % 2 !== 0) {
    return null;
  }
  return Buffer.from(value, "hex");
}

function safeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
