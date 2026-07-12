import { createServer, type ServerResponse } from "node:http";
import { env } from "./config/env.js";
import type { ApiRequest } from "./types.js";
import { json } from "./utils/http.js";
import { readJsonBody, shouldReadJsonBody } from "./utils/body.js";
import { dispatch } from "./router/dispatch.js";
import { logger, newRequestId } from "./observability/logger.js";
import { applySecurityHeaders } from "./security/headers.js";
import { createRateLimiter, clientKey } from "./security/rate-limit.js";
import { createAppRouter } from "./routes/registry.js";

const appRouter = createAppRouter();

// Global per-IP throttle plus a stricter bucket for auth endpoints (brute-force
// defense complementing the per-account lockout in middleware/auth).
const globalLimiter = createRateLimiter({ windowMs: env.rateLimitWindowMs, max: env.rateLimitMax });
const authLimiter = createRateLimiter({ windowMs: env.rateLimitWindowMs, max: env.authRateLimitMax });
const AUTH_RATE_LIMITED_PATHS = new Set(["/api/auth/login", "/api/auth/refresh"]);

function enforceRateLimit(req: ApiRequest, res: ServerResponse, pathname: string): boolean {
  const key = clientKey(req.headers, req.socket.remoteAddress);
  const isAuthPath = AUTH_RATE_LIMITED_PATHS.has(pathname);
  const limiter = isAuthPath ? authLimiter : globalLimiter;
  const result = limiter.check(`${isAuthPath ? "auth" : "global"}:${key}`);
  if (result.allowed) {
    return false;
  }
  const retryAfterSec = Math.ceil(result.retryAfterMs / 1000);
  res.setHeader("Retry-After", String(retryAfterSec));
  logger.warn("rate limit exceeded", {
    requestId: req.requestId,
    path: pathname,
    scope: isAuthPath ? "auth" : "global"
  });
  json(res, 429, { error: "Too Many Requests", retryAfterSeconds: retryAfterSec });
  return true;
}

async function router(req: ApiRequest, res: ServerResponse) {
  applySecurityHeaders(res);
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  req.requestId = newRequestId();
  res.setHeader("X-Request-Id", req.requestId);
  const url = new URL(req.url || "/", `http://${env.host}:${env.port}`);

  if (enforceRateLimit(req, res, url.pathname)) {
    return;
  }

  try {
    if (shouldReadJsonBody(req.method, req.headers["content-type"], url.pathname)) {
      req.body = await readJsonBody(req);
    }

    if (await dispatch(appRouter, req, res, url.pathname)) {
      return;
    }

    return json(res, 404, { error: "Not Found" });
  } catch (err) {
    logger.error("unhandled request error", {
      requestId: req.requestId,
      method: req.method,
      path: url.pathname,
      error: err instanceof Error ? err.message : String(err)
    });
    if (!res.headersSent) {
      json(res, 500, { error: "Internal Server Error", requestId: req.requestId });
    }
  }
}

export function buildApp() {
  // Error boundary: `router` is async, so a rejected handler promise would
  // otherwise surface as an unhandledRejection and terminate the whole process
  // (taking every subsequent request down with it — nginx then returns 502).
  // Catch here so a single failing request yields a 500 and the server stays up.
  return createServer((req, res) => {
    void router(req as ApiRequest, res).catch((error) => {
      console.error("[api] unhandled request error:", error);
      if (!res.headersSent) {
        json(res, 500, { error: "Internal Server Error" });
      } else {
        res.destroy();
      }
    });
  });
}
