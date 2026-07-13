import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Open-platform credentials (D6): API keys and webhook signatures.
 *
 * API keys are high-entropy random tokens, so only their SHA-256 hash is stored
 * (like passwords, but a fast hash is fine — there is nothing to brute-force).
 * Webhook payloads are signed with HMAC-SHA256 so receivers can verify
 * authenticity and integrity. Dependency-free.
 */

const API_KEY_PREFIX = "ftk_";

export interface GeneratedApiKey {
  /** Shown to the user once; never stored. */
  key: string;
  /** Stored server-side for verification. */
  hash: string;
}

export function generateApiKey(): GeneratedApiKey {
  const key = `${API_KEY_PREFIX}${randomBytes(24).toString("hex")}`;
  return { key, hash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function verifyApiKey(candidate: string, storedHash: string): boolean {
  if (typeof candidate !== "string" || typeof storedHash !== "string") {
    return false;
  }
  const candidateHash = hashApiKey(candidate);
  if (candidateHash.length !== storedHash.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(candidateHash), Buffer.from(storedHash));
}

export function signWebhook(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function verifyWebhookSignature(secret: string, body: string, signature: string): boolean {
  if (typeof signature !== "string" || signature.length === 0) {
    return false;
  }
  const expected = signWebhook(secret, body);
  if (expected.length !== signature.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
