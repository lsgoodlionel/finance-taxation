/**
 * 路由表分组：报表 / 研发费用 / 风险。
 *
 * 自 `routes/registry.ts` 拆出（V15/P2）。原文件 1787 行里有 1300 行是
 * **一个数组字面量**，任何两个人同时加接口都在同一处冲突。
 */
import type { RouteDef } from "../../router/router.js";
import { createReportSnapshot, getBalanceSheet, getCashFlow, getChairmanReportSummary, getPrintableReport, getProfitStatement, getReportDiff, listReportSnapshots } from "../../modules/reports/routes.js";
import { getTrialBalance } from "../../modules/reports/trial-balance.routes.js";
import { closeRiskFinding, listRiskClosureRecords, listRiskFindings } from "../../modules/risk/routes.js";
import { createRndCostLine, createRndProject, createRndTimeEntry, getRndProjectDetail, getRndSuperDeductionPackage, getRndTrend, listRndProjects } from "../../modules/rnd/routes.js";

export const reportsRiskRoutes: RouteDef[] = [
  // reports
  { method: "GET", path: "/api/reports/balance-sheet", auth: true, permission: "ledger.view", handler: getBalanceSheet },
  { method: "GET", path: "/api/reports/profit-statement", auth: true, permission: "ledger.view", handler: getProfitStatement },
  { method: "GET", path: "/api/reports/cash-flow", auth: true, permission: "ledger.view", handler: getCashFlow },
  { method: "GET", path: "/api/reports/trial-balance", auth: true, permission: "ledger.view", handler: getTrialBalance },
  { method: "GET", path: "/api/reports/snapshots", auth: true, permission: "ledger.view", handler: listReportSnapshots },
  // 快照是对外可引用的正式报表留档，属记账产出而非查阅动作。
  { method: "POST", path: "/api/reports/snapshots", auth: true, permission: "ledger.post", handler: createReportSnapshot },
  { method: "GET", path: "/api/reports/diff", auth: true, permission: "ledger.view", handler: getReportDiff },
  { method: "GET", path: "/api/reports/chairman-summary", auth: true, permission: "dashboard.view", handler: getChairmanReportSummary },
  { method: "GET", path: "/api/reports/printable", auth: true, permission: "ledger.view", handler: getPrintableReport },

  // rnd
  { method: "GET", path: "/api/rnd/trend", auth: true, permission: "rnd.view", handler: getRndTrend },
  { method: "GET", path: "/api/rnd/projects", auth: true, permission: "rnd.view", handler: listRndProjects },
  { method: "POST", path: "/api/rnd/projects", auth: true, permission: "rnd.manage", handler: createRndProject },
  {
    method: "GET",
    path: "/api/rnd/projects/:id/super-deduction-package",
    auth: true,
    permission: "rnd.view",
    handler: (req, res, p) => getRndSuperDeductionPackage(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/rnd/projects/:id/cost-lines",
    auth: true,
    permission: "rnd.manage",
    handler: (req, res, p) => createRndCostLine(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/rnd/projects/:id/time-entries",
    auth: true,
    permission: "rnd.manage",
    handler: (req, res, p) => createRndTimeEntry(req, res, p.id!)
  },
  {
    method: "GET",
    path: "/api/rnd/projects/:id",
    auth: true,
    permission: "rnd.view",
    handler: (req, res, p) => getRndProjectDetail(req, res, p.id!)
  },

  // risk
  { method: "GET", path: "/api/risk/findings", auth: true, permission: "risk.view", handler: listRiskFindings },
  {
    method: "POST",
    path: "/api/risk/findings/:id/close",
    auth: true,
    permission: "risk.manage",
    handler: (req, res, p) => closeRiskFinding(req, res, p.id!)
  },
  {
    method: "GET",
    path: "/api/risk/findings/:id/closures",
    auth: true,
    permission: "risk.view",
    handler: (req, res, p) => listRiskClosureRecords(req, res, p.id!)
  },
];
