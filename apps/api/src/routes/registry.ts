/**
 * 路由表：把按领域分组的路由拼成一张表，并交给 router 注册。
 *
 * V15/P2：这里曾是 400 行 import + 一个 1300 行的数组字面量，
 * 任何两个人同时加接口都在同一处冲突。现在每组自带 import，
 * 这个文件只负责**顺序**。
 *
 * **顺序有语义**：具体子路径必须排在 `/:id` 通配之前，否则
 * `/api/events/:id` 会把 `/api/events/:id/collaborators` 吃掉。
 * 组内顺序和组间顺序都沿用拆分前的原样，不要随手调换。
 */
import { createRouter, type Router, type RouteDef } from "../router/router.js";
import { BODY_SCHEMAS } from "./body-schemas.js";
import { coreRoutes } from "./groups/core.js";
import { eventsTasksRoutes } from "./groups/events-tasks.js";
import { ledgerRoutes } from "./groups/ledger.js";
import { expenseControlRoutes } from "./groups/expense-control.js";
import { reportsRiskRoutes } from "./groups/reports-risk.js";
import { documentsTaxRoutes } from "./groups/documents-tax.js";
import { payrollRoutes } from "./groups/payroll.js";
import { contractsExportRoutes } from "./groups/contracts-export.js";
import { settingsBankingRoutes } from "./groups/settings-banking.js";
import { platformRoutes } from "./groups/platform.js";

const routes: RouteDef[] = [
  ...coreRoutes,
  ...eventsTasksRoutes,
  ...ledgerRoutes,
  ...expenseControlRoutes,
  ...reportsRiskRoutes,
  ...documentsTaxRoutes,
  ...payrollRoutes,
  ...contractsExportRoutes,
  ...settingsBankingRoutes,
  ...platformRoutes,
];


export function createAppRouter(): Router {
  const appRouter = createRouter();
  for (const route of routes) {
    // F9: attach a declarative body schema from the central map unless the route
    // already declares one inline (inline wins).
    const bodySchema = route.bodySchema ?? BODY_SCHEMAS[`${route.method} ${route.path}`];
    appRouter.register(bodySchema ? { ...route, bodySchema } : route);
  }
  return appRouter;
}
