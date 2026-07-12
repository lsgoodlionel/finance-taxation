import { createHash } from "node:crypto";

/**
 * Tamper-evident hash chain for audit trails (金税四期「审计留痕」).
 *
 * Each record is bound to the previous one via
 *   hash = sha256(prevHash + canonicalJSON(payload))
 * so any retroactive edit, insertion, or deletion breaks every downstream hash
 * and is detectable by `verifyChain`. Pure and dependency-free.
 */

export const GENESIS_HASH = "0".repeat(64);

export interface ChainedRecord<T = unknown> {
  seq: number;
  payload: T;
  prevHash: string;
  hash: string;
}

/** Deterministic JSON with recursively sorted object keys. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`);
  return `{${entries.join(",")}}`;
}

export function hashRecord(prevHash: string, payload: unknown): string {
  return createHash("sha256").update(prevHash).update(canonical(payload)).digest("hex");
}

/** Append one payload to a chain given the previous hash. */
export function appendRecord<T>(prevHash: string, seq: number, payload: T): ChainedRecord<T> {
  return { seq, payload, prevHash, hash: hashRecord(prevHash, payload) };
}

/** Build a fresh chain from an ordered list of payloads. */
export function buildChain<T>(payloads: readonly T[]): ChainedRecord<T>[] {
  const chain: ChainedRecord<T>[] = [];
  let prevHash = GENESIS_HASH;
  payloads.forEach((payload, index) => {
    const record = appendRecord(prevHash, index, payload);
    chain.push(record);
    prevHash = record.hash;
  });
  return chain;
}

export interface ChainVerification {
  valid: boolean;
  /** seq of the first record whose hash/linkage does not verify, if any. */
  brokenAt?: number;
}

export function verifyChain(chain: readonly ChainedRecord[]): ChainVerification {
  let prevHash = GENESIS_HASH;
  for (const record of chain) {
    if (record.prevHash !== prevHash) {
      return { valid: false, brokenAt: record.seq };
    }
    if (hashRecord(prevHash, record.payload) !== record.hash) {
      return { valid: false, brokenAt: record.seq };
    }
    prevHash = record.hash;
  }
  return { valid: true };
}
