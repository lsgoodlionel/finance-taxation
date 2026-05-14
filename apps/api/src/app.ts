import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { env } from "./config/env.js";
import { handleAuthMeta } from "./modules/auth/routes.js";
import { handleChairmanDashboard } from "./modules/dashboard/routes.js";
import { handleEventsMeta } from "./modules/events/routes.js";
import { handleTasksMeta } from "./modules/tasks/routes.js";
import { json } from "./utils/http.js";

function router(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || "/", `http://${env.host}:${env.port}`);

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, {
      ok: true,
      service: env.appName,
      phase: "sprint-0",
      modules: ["auth", "events", "tasks", "ledger", "tax"]
    });
  }

  if (req.method === "GET" && url.pathname === "/bootstrap") {
    return json(res, 200, {
      appName: env.appName,
      phase: "sprint-0",
      nextTargets: ["business_events", "tasks", "rbac", "chairman_dashboard"]
    });
  }

  if (req.method === "GET" && url.pathname === "/v2/meta/rbac") {
    return handleAuthMeta(req, res);
  }

  if (req.method === "GET" && url.pathname === "/v2/meta/business-events") {
    return handleEventsMeta(req, res);
  }

  if (req.method === "GET" && url.pathname === "/v2/meta/tasks") {
    return handleTasksMeta(req, res);
  }

  if (req.method === "GET" && url.pathname === "/v2/dashboard/chairman") {
    return handleChairmanDashboard(req, res);
  }

  return json(res, 404, { error: "Not Found" });
}

export function buildApp() {
  return createServer(router);
}
