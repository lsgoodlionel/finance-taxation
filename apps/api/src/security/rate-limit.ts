import type { IncomingHttpHeaders } from "node:http";

/**
 * Dependency-free fixed-window rate limiter (in-memory).
 *
 * Intended as a first line of defense against brute-force and abusive traffic —
 * notably IP-level throttling on the login endpoint, complementing the
 * per-account lockout in middleware/auth. Being in-memory it is per-instance;
 * a multi-instance deployment should move the store to Redis behind this same
 * interface. Counts are keyed by caller identity (see `clientKey`).
 */

export interface RateLimitResult {
  allowed: boolean;
  /** Remaining requests permitted in the current window. */
  remaining: number;
  /** Milliseconds until the current window resets (0 when allowed and fresh). */
  retryAfterMs: number;
}

export interface RateLimiter {
  check(key: string, now?: number): RateLimitResult;
}

interface Bucket {
  count: number;
  windowStart: number;
}

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
}

export function createRateLimiter({ windowMs, max }: RateLimiterOptions): RateLimiter {
  const buckets = new Map<string, Bucket>();

  return {
    check(key: string, now = Date.now()): RateLimitResult {
      const existing = buckets.get(key);
      if (!existing || now - existing.windowStart >= windowMs) {
        buckets.set(key, { count: 1, windowStart: now });
        return { allowed: true, remaining: Math.max(0, max - 1), retryAfterMs: 0 };
      }

      existing.count += 1;
      const allowed = existing.count <= max;
      const remaining = Math.max(0, max - existing.count);
      const retryAfterMs = allowed ? 0 : existing.windowStart + windowMs - now;
      return { allowed, remaining, retryAfterMs };
    }
  };
}

/**
 * Derive a stable caller identity for rate limiting. Prefers the first hop of
 * `X-Forwarded-For` (client-facing proxies prepend the real client IP) and
 * falls back to the socket address.
 */
export function clientKey(
  headers: IncomingHttpHeaders,
  socketAddress: string | undefined
): string {
  const forwarded = headers["x-forwarded-for"];
  const forwardedValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (forwardedValue) {
    const first = forwardedValue.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  return socketAddress ?? "unknown";
}
