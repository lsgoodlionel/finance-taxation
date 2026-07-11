import type { ServerResponse } from "node:http";

/**
 * Baseline security response headers applied to every API response.
 *
 * These are universally safe for both JSON and the few HTML/PDF-returning
 * endpoints: they harden transport, framing, MIME sniffing, referrer leakage
 * and browser feature access without restricting content sources. A stricter
 * per-endpoint Content-Security-Policy for HTML responses can layer on later;
 * the CSP here only forbids framing and base-tag/`object` injection.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": "frame-ancestors 'none'; base-uri 'none'; object-src 'none'"
};

export function applySecurityHeaders(res: ServerResponse): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(name, value);
  }
}
