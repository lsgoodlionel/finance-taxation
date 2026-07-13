import { test } from "node:test";
import assert from "node:assert/strict";
import { SECURITY_HEADERS, applySecurityHeaders } from "./headers.js";

function fakeRes() {
  const headers: Record<string, string> = {};
  return {
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    headers
  };
}

test("applySecurityHeaders sets every configured security header", () => {
  const res = fakeRes();
  applySecurityHeaders(res as never);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    assert.equal(res.headers[name], value, `expected ${name} to be set`);
  }
});

test("includes HSTS with a one-year max-age and preload", () => {
  assert.match(SECURITY_HEADERS["Strict-Transport-Security"]!, /max-age=31536000/);
  assert.match(SECURITY_HEADERS["Strict-Transport-Security"]!, /includeSubDomains/);
  assert.match(SECURITY_HEADERS["Strict-Transport-Security"]!, /preload/);
});

test("denies framing and MIME sniffing", () => {
  assert.equal(SECURITY_HEADERS["X-Frame-Options"], "DENY");
  assert.equal(SECURITY_HEADERS["X-Content-Type-Options"], "nosniff");
  assert.match(SECURITY_HEADERS["Content-Security-Policy"]!, /frame-ancestors 'none'/);
});

test("sets a privacy-preserving referrer policy", () => {
  assert.equal(SECURITY_HEADERS["Referrer-Policy"], "strict-origin-when-cross-origin");
});
