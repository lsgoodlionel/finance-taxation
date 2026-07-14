import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../types.js";
import { requireAuth, requireAnyPermission, requirePermission } from "../middleware/auth.js";
import { json } from "../utils/http.js";
import { validateObject } from "../utils/validate.js";
import { env } from "../config/env.js";
import { withTenantRequest } from "../db/tenant.js";
import type { Router, RoutePermission } from "./router.js";

const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);

/**
 * Resolve a request against the router and, if matched, enforce the route's
 * auth/permission requirements before invoking its handler. Returns `true` when
 * the request was handled (matched or rejected by auth), `false` when no route
 * matched so the caller can fall through to the legacy dispatch chain during
 * the incremental migration.
 *
 * Handler errors are intentionally NOT caught here — they bubble to the single
 * top-level error middleware in app.ts so migrated and legacy routes share one
 * failure path.
 */
export async function dispatch(
  router: Router,
  req: ApiRequest,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  const method = req.method ?? "GET";
  const hit = router.match(method, pathname);
  if (!hit) {
    return false;
  }

  const { route, params } = hit;
  if (route.auth && !(await requireAuth(req, res))) {
    return true;
  }
  if (route.permission && !(await enforcePermission(route.permission, req, res))) {
    return true;
  }
  if (route.bodySchema && BODY_METHODS.has(method)) {
    const result = validateObject(req.body, route.bodySchema);
    if (!result.ok) {
      json(res, 400, { error: "请求参数校验失败", details: result.errors });
      return true;
    }
  }

  // F8: run authenticated non-streaming handlers inside a per-request tenant
  // transaction so Postgres RLS scopes every query. Gated by env (off by
  // default) and only when the request is authenticated with a companyId.
  const companyId = req.auth?.companyId;
  if (env.tenantRlsEnabled && route.auth && companyId && !route.streaming) {
    await withTenantRequest(companyId, () => Promise.resolve(route.handler(req, res, params)));
    return true;
  }

  await route.handler(req, res, params);
  return true;
}

function enforcePermission(
  permission: RoutePermission,
  req: ApiRequest,
  res: ServerResponse
): Promise<boolean> {
  if (typeof permission === "object" && "anyOf" in permission) {
    return requireAnyPermission(permission.anyOf, req, res);
  }
  return requirePermission(permission, req, res);
}
