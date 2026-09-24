/**
 * 路由表分组：健康检查 / 引导 / 认证 / 访问控制 / 菜单 / 驾驶舱。
 *
 * 自 `routes/registry.ts` 拆出（V15/P2）。原文件 1787 行里有 1300 行是
 * **一个数组字面量**，任何两个人同时加接口都在同一处冲突。
 */
import type { RouteDef } from "../../router/router.js";
import { bootstrapHandler, healthHandler } from "../shared-handlers.js";
import { login, logout, me, refresh } from "../../middleware/auth.js";
import { getMenu } from "../../modules/access/routes.js";
import { handleAuthMeta } from "../../modules/auth/routes.js";
import { handleChairmanDashboard, handleChairmanTrend } from "../../modules/dashboard/routes.js";
import { handleEventsMeta } from "../../modules/events/routes.js";
import { handleTasksMeta } from "../../modules/tasks/routes.js";

export const coreRoutes: RouteDef[] = [
  { method: "GET", path: "/health", handler: healthHandler },
  { method: "GET", path: "/api/health", handler: healthHandler },
  { method: "GET", path: "/bootstrap", handler: bootstrapHandler },
  { method: "GET", path: "/v2/meta/rbac", handler: handleAuthMeta },
  { method: "GET", path: "/v2/meta/business-events", handler: handleEventsMeta },
  { method: "GET", path: "/v2/meta/tasks", handler: handleTasksMeta },
  {
    method: "GET",
    path: "/v2/dashboard/chairman",
    auth: true,
    permission: "dashboard.view",
    handler: handleChairmanDashboard
  },
  {
    method: "GET",
    path: "/api/dashboard/chairman/trend",
    auth: true,
    permission: "dashboard.view",
    handler: handleChairmanTrend
  },
  { method: "POST", path: "/api/auth/login", handler: login },
  { method: "POST", path: "/api/auth/refresh", handler: refresh },
  { method: "POST", path: "/api/auth/logout", auth: true, handler: logout },
  { method: "GET", path: "/api/access/me", auth: true, handler: me },
  { method: "GET", path: "/api/access/menu", auth: true, handler: getMenu },
];
