import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { env } from "../config/env.js";

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
 *
 * IMPORTANT: hashing/verification use the ASYNC `scrypt` (libuv threadpool) —
 * never the synchronous variant. scrypt at the OWASP work factor (~128MB) takes
 * hundreds of ms; running it synchronously blocks the single-threaded event loop
 * and serialises every concurrent request behind it. Under a CPU-constrained
 * runner that stretches login latency past client timeouts. Async keeps the
 * event loop free and lets logins parallelise across threadpool threads.
 */

const SCHEME = "scrypt";
const BLOCK_SIZE_R = 8;
const PARALLELISM_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
// scrypt needs 128 * N * r bytes (≈128MB at N=2^17); give headroom above that.
const MAX_MEM = 256 * 1024 * 1024;
// Upper bound on a stored N to keep a tampered/corrupt row from triggering a
// pathologically expensive scrypt (defense-in-depth; stored values are DB-side).
const MAX_COST_N = 1 << 20;

// Current cost factor is env-configurable so the test stack can dial it down
// (see docker-compose.test.yml) while production keeps the OWASP baseline
// (N=2^17). Falls back to the OWASP baseline when unset/invalid.
function currentCostN(): number {
  return env.loginScryptCostN;
}

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;

export async function hashPassword(plain: string): Promise<string> {
  const costN = currentCostN();
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(plain, salt, costN, BLOCK_SIZE_R, PARALLELISM_P);
  return [
    SCHEME,
    costN,
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
 * Verify a candidate password against a stored value. Resolves to `false`
 * (never rejects) for malformed hashes so callers can treat any failure as a
 * rejected credential.
 */
export async function verifyPassword(candidate: string, stored: string): Promise<boolean> {
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
    const candidateKey = await deriveKey(candidate, parsed.salt, parsed.n, parsed.r, parsed.p);
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
  return parsed.n !== currentCostN() || parsed.r !== BLOCK_SIZE_R || parsed.p !== PARALLELISM_P;
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

function deriveKey(plain: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return scryptAsync(plain, salt, KEY_LENGTH, { N: n, r, p, maxmem: MAX_MEM });
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
