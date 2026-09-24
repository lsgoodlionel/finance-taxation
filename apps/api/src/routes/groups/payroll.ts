/**
 * 路由表分组：员工 / 工资 / 代发。
 *
 * 自 `routes/registry.ts` 拆出（V15/P2）。原文件 1787 行里有 1300 行是
 * **一个数组字面量**，任何两个人同时加接口都在同一处冲突。
 */
import type { RouteDef } from "../../router/router.js";
import { submitTransferApiRoute } from "../../modules/banking/bank-api.routes.js";
import { computePayroll, confirmPayroll, createEmployee, getPayrollPeriods, getPayrollPolicy, listEmployees, listPayroll, listPayrollReviewLedgers, syncPayrollReviewLedgers, updateEmployee, updatePayrollPolicy, updateSalaryAccounts } from "../../modules/payroll/routes.js";
import { socialSecurityClosureRoute } from "../../modules/payroll/social-security.routes.js";
import { approveBatchRoute, buildBatchRoute, compensateBatchRoute, disburseBatchRoute, downloadBatchFileRoute, getBatchRoute, listBatchesRoute } from "../../modules/payroll/transfer.routes.js";
import { getPayrollRuntimeSummaryRoute, getPayrollTransferRuntimeSummaryRoute } from "../../modules/runtime/routes.js";

export const payrollRoutes: RouteDef[] = [
  // employees
  { method: "GET", path: "/api/employees", auth: true, permission: "payroll.view", handler: listEmployees },
  { method: "POST", path: "/api/employees", auth: true, permission: "payroll.manage", handler: createEmployee },
  {
    method: "PUT",
    path: "/api/employees/:id",
    auth: true,
    permission: "payroll.manage",
    handler: (req, res, p) => updateEmployee(req, res, p.id!)
  },

  // payroll — policy / periods / compute / review
  { method: "GET", path: "/api/payroll/policy", auth: true, permission: "payroll.view", handler: getPayrollPolicy },
  { method: "PUT", path: "/api/payroll/policy", auth: true, permission: "payroll.manage", handler: updatePayrollPolicy },
  { method: "GET", path: "/api/payroll/periods", auth: true, permission: "payroll.view", handler: getPayrollPeriods },
  {
    method: "POST",
    path: "/api/payroll/periods/:id/social-security-closure",
    auth: true,
    permission: "payroll.manage",
    handler: (req, res, p) => socialSecurityClosureRoute(req, res, p.id!)
  },
  { method: "POST", path: "/api/payroll/compute", auth: true, permission: "payroll.manage", handler: computePayroll },
  { method: "GET", path: "/api/payroll/review-ledgers", auth: true, permission: "payroll.view", handler: listPayrollReviewLedgers },
  { method: "POST", path: "/api/payroll/review-ledgers", auth: true, permission: "payroll.manage", handler: syncPayrollReviewLedgers },
  { method: "PATCH", path: "/api/payroll/employees/salary-accounts", auth: true, permission: "payroll.manage", handler: updateSalaryAccounts },

  // payroll — transfer (P3)
  { method: "GET", path: "/api/payroll/transfer/batches", auth: true, permission: "payroll.view", handler: listBatchesRoute },
  { method: "POST", path: "/api/payroll/transfer/batches", auth: true, permission: "payroll.manage", handler: buildBatchRoute },
  { method: "GET", path: "/api/runtime/payroll-transfer", auth: true, permission: "payroll.view", handler: getPayrollTransferRuntimeSummaryRoute },
  {
    method: "GET",
    path: "/api/payroll/transfer/batches/:id/file",
    auth: true,
    permission: "payroll.view",
    handler: (req, res, p) => downloadBatchFileRoute(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/payroll/transfer/batches/:id/approve",
    auth: true,
    permission: "payroll.manage",
    handler: (req, res, p) => approveBatchRoute(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/payroll/transfer/batches/:id/disburse",
    auth: true,
    permission: "payroll.manage",
    handler: (req, res, p) => disburseBatchRoute(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/payroll/transfer/batches/:id/compensate",
    auth: true,
    permission: "payroll.manage",
    handler: (req, res, p) => compensateBatchRoute(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/payroll/transfer/batches/:id/submit-api",
    auth: true,
    permission: "payroll.manage",
    handler: (req, res, p) => submitTransferApiRoute(req, res, p.id!)
  },
  {
    method: "GET",
    path: "/api/payroll/transfer/batches/:id",
    auth: true,
    permission: "payroll.view",
    handler: (req, res, p) => getBatchRoute(req, res, p.id!)
  },

  // payroll — base
  { method: "GET", path: "/api/payroll", auth: true, permission: "payroll.view", handler: listPayroll },
  { method: "GET", path: "/api/runtime/payroll", auth: true, permission: "payroll.view", handler: getPayrollRuntimeSummaryRoute },
  {
    method: "POST",
    path: "/api/payroll/:id/confirm",
    auth: true,
    permission: "payroll.manage",
    handler: (req, res, p) => confirmPayroll(req, res, p.id!)
  },
];
