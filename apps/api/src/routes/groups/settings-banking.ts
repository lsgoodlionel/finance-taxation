/**
 * 路由表分组：系统设置 / 申报对接 / 银行。
 *
 * 自 `routes/registry.ts` 拆出（V15/P2）。原文件 1787 行里有 1300 行是
 * **一个数组字面量**，任何两个人同时加接口都在同一处冲突。
 */
import type { RouteDef } from "../../router/router.js";
import { syncStatementsRoute } from "../../modules/banking/bank-api.routes.js";
import { createBankAccount, getUnmatchedSummary, importBankStatements, listBankAccounts, listBankStatements, matchStatement } from "../../modules/banking/bank.routes.js";
import { confirmCandidateRoute, getReconRulesRoute, listCandidatesRoute, rejectCandidateRoute, runReconciliationRoute, upsertReconRulesRoute } from "../../modules/banking/recon.routes.js";
import { getIntegrationConfig, listIntegrationConfigs, testIntegrationConfig, upsertIntegrationConfig } from "../../modules/settings/integration-config.routes.js";
import { getAiSettings, getCompanySettings, getOllamaModels, getUserList, testAiConnection, updateAiSettings, updateCompanySettings } from "../../modules/settings/routes.js";
import { confirmSubmission, exportFundCsv, exportIitCsv, exportSiCsv, exportVatXml, listSubmissions } from "../../modules/tax-integration/declaration-export.routes.js";

export const settingsBankingRoutes: RouteDef[] = [
  // settings —— 读接口响应已脱敏（maskSecret / apiKeyMasked），保留 dashboard.view；
  // 写接口一律 settings.manage：它们改的是公司资料（含 financeApproverRole 这一职责
  // 分离配置）、AI 服务商凭证、以及第三方对接凭证与端点。挂 dashboard.view 时每个
  // 角色（含纯只读的 role-viewer）都能改写通知渠道的默认接收人，从而劫持全公司的
  // 风险预警/待复核/待批/逾期提醒信道。
  { method: "GET", path: "/api/settings/company", auth: true, permission: "dashboard.view", handler: getCompanySettings },
  { method: "PUT", path: "/api/settings/company", auth: true, permission: "settings.manage", handler: updateCompanySettings },
  { method: "GET", path: "/api/settings/ai", auth: true, permission: "dashboard.view", handler: getAiSettings },
  { method: "PUT", path: "/api/settings/ai", auth: true, permission: "settings.manage", handler: updateAiSettings },
  // 这两条都会向调用方提供的 baseUrl 发起服务端请求（SSRF sink），同样收归 settings.manage。
  { method: "GET", path: "/api/settings/ai/ollama-models", auth: true, permission: "settings.manage", handler: getOllamaModels },
  { method: "POST", path: "/api/settings/ai/test", auth: true, permission: "settings.manage", handler: testAiConnection },
  { method: "GET", path: "/api/settings/users", auth: true, permission: "dashboard.view", handler: getUserList },
  { method: "GET", path: "/api/settings/integrations", auth: true, permission: "dashboard.view", handler: listIntegrationConfigs },
  {
    method: "POST",
    path: "/api/settings/integrations/:type/test",
    auth: true,
    permission: "settings.manage",
    handler: (req, res, p) => testIntegrationConfig(req, res, p.type!)
  },
  {
    method: "GET",
    path: "/api/settings/integrations/:type",
    auth: true,
    permission: "dashboard.view",
    handler: (req, res, p) => getIntegrationConfig(req, res, p.type!)
  },
  {
    method: "PUT",
    path: "/api/settings/integrations/:type",
    auth: true,
    permission: "settings.manage",
    handler: (req, res, p) => upsertIntegrationConfig(req, res, p.type!)
  },

  // tax-integration
  { method: "GET", path: "/api/tax-integration/vat-xml", auth: true, permission: "tax.manage", handler: exportVatXml },
  { method: "GET", path: "/api/tax-integration/iit-csv", auth: true, permission: "tax.manage", handler: exportIitCsv },
  { method: "GET", path: "/api/tax-integration/si-csv", auth: true, permission: "tax.manage", handler: exportSiCsv },
  { method: "GET", path: "/api/tax-integration/fund-csv", auth: true, permission: "tax.manage", handler: exportFundCsv },
  { method: "GET", path: "/api/tax-integration/submissions", auth: true, permission: "tax.view", handler: listSubmissions },
  {
    method: "PATCH",
    path: "/api/tax-integration/submissions/:id/confirm",
    auth: true,
    permission: "tax.manage",
    handler: (req, res, p) => confirmSubmission(req, res, p.id!)
  },

  // banking (P1 accounts/statements + P3 reconciliation + P5 sync)
  // 银行账户、流水导入/同步与对账确认都会改变账务基础数据，统一按 banking.manage 守护。
  // 演进过程：此前整组无 permission，任何登录用户（含 role-viewer）都能导流水、确认对账；
  // 先收到 ledger.post 堵住这个洞，但那是记账权、出纳不持有，等于把出纳挡在自己的
  // 本职工作外面。banking.manage 单独成键，给董事长/财务负责人/会计/出纳四个角色。
  //
  // 读接口挂 ledger.view 而非 banking.manage：账号、余额、逐笔流水与对账规则都是
  // 总账口径的账务数据，归口与 /api/ledger/* 一致（银行页本身是票据中心的一个 Tab）。
  // 读写用不同前缀是有意的 —— 能看账不等于能动账，而 banking.manage 的四个角色
  // 都持有 ledger.view，不存在「能写不能读」的空洞。
  { method: "GET", path: "/api/banking/accounts", auth: true, permission: "ledger.view", handler: listBankAccounts },
  { method: "POST", path: "/api/banking/accounts", auth: true, permission: "banking.manage", handler: createBankAccount },
  { method: "GET", path: "/api/banking/statements", auth: true, permission: "ledger.view", handler: listBankStatements },
  { method: "POST", path: "/api/banking/statements/import", auth: true, permission: "banking.manage", handler: importBankStatements },
  { method: "GET", path: "/api/banking/statements/unmatched", auth: true, permission: "ledger.view", handler: getUnmatchedSummary },
  {
    method: "PATCH",
    path: "/api/banking/statements/:id/match",
    auth: true,
    permission: "banking.manage",
    handler: (req, res, p) => matchStatement(req, res, p.id!)
  },
  { method: "POST", path: "/api/banking/reconciliation/run", auth: true, permission: "banking.manage", handler: runReconciliationRoute },
  { method: "GET", path: "/api/banking/reconciliation/candidates", auth: true, permission: "ledger.view", handler: listCandidatesRoute },
  {
    method: "POST",
    path: "/api/banking/reconciliation/candidates/:id/confirm",
    auth: true,
    permission: "banking.manage",
    handler: (req, res, p) => confirmCandidateRoute(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/banking/reconciliation/candidates/:id/reject",
    auth: true,
    permission: "banking.manage",
    handler: (req, res, p) => rejectCandidateRoute(req, res, p.id!)
  },
  { method: "GET", path: "/api/banking/reconciliation/rules", auth: true, permission: "ledger.view", handler: getReconRulesRoute },
  { method: "PUT", path: "/api/banking/reconciliation/rules", auth: true, permission: "banking.manage", handler: upsertReconRulesRoute },
  { method: "POST", path: "/api/banking/sync-statements", auth: true, permission: "banking.manage", handler: syncStatementsRoute },
];
