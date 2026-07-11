import { createServer, type ServerResponse } from "node:http";
import { env } from "./config/env.js";
import type { ApiRequest } from "./types.js";
import { json } from "./utils/http.js";
import { readJsonBody, shouldReadJsonBody } from "./utils/body.js";
import { dispatch } from "./router/dispatch.js";
import { logger, newRequestId } from "./observability/logger.js";
import { applySecurityHeaders } from "./security/headers.js";
import { createAppRouter } from "./routes/registry.js";

const appRouter = createAppRouter();

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
  return createServer(router);
}
