import { env } from "../config/env.js";
import { query } from "../db/client.js";
import { getMenu } from "../modules/access/routes.js";
import {
  createAcceptanceRoute,
  listAcceptancesRoute,
  scheduleThreeWayRoute,
  transitionAcceptanceRoute
} from "../modules/acceptances/routes.js";
import { expenseAnalysisRoute } from "../modules/reports/expense-analysis-routes.js";
import {
  cancelScheduleRoute,
  confirmPaymentRoute,
  createPaymentRoute,
  createScheduleRoute,
  exportPaymentsRoute,
  listDuePaymentsRoute,
  listPaymentsRoute,
  listSchedulesRoute
} from "../modules/payments/routes.js";

import {
  auditReimbursementRoute,
  createReimbursementRoute,
  getReimbursementRoute,
  invoiceReimbursementUsageRoute,
  listReimbursementsRoute,
  transitionReimbursementRoute
} from "../modules/reimbursements/routes.js";

import {
  createAdvanceRoute,
  getAdvanceRoute,
  listAdvancesRoute,
  payAdvanceRoute,
  transitionAdvanceRoute
} from "../modules/advances/routes.js";

import {
  createRequestRoute,
  getRequestRoute,
  listRequestsRoute,
  precheckRequestRoute,
  transitionRequestRoute,
  updateRequestRoute
} from "../modules/requests/routes.js";

import {
  actOnApprovalRoute,
  listWatchedRoute,
  markWatchedReadRoute,
  createFlowRoute,
  getApprovalDetailRoute,
  listFlowsRoute,
  listPendingRoute,
  submitApprovalRoute
} from "../modules/approval/routes.js";

import {
  checkBudgetRoute,
  createBudgetRoute,
  deleteBudgetRoute,
  listBudgetsRoute,
  updateBudgetRoute
} from "../modules/budget/routes.js";
import {
  checkExpenseStandardRoute,
  createExpenseStandardRoute,
  expireExpenseStandardRoute,
  listExpenseStandardsRoute
} from "../modules/expense-standards/routes.js";

import { listAccounts, getAccountByCode, createAccount, updateAccount } from "../modules/accounts/routes.js";
import { handleAuthMeta } from "../modules/auth/routes.js";
import { handleChairmanDashboard, handleChairmanTrend } from "../modules/dashboard/routes.js";
import {
  attachDocumentFile,
  archiveDocument,
  downloadAttachment,
  getDocumentDetail,
  listDocumentAttachments,
  listDocuments,
  updateDocument,
  uploadDocumentFile
} from "../modules/documents/routes.js";
import {
  analyzeEvent,
  createEvent,
  getEventDetail,
  handleEventsMeta,
  listEvents,
  updateEvent
} from "../modules/events/routes.js";
import {
  getCashJournal,
  getLedgerBalances,
  getLedgerSummary,
  listAccountingPeriods,
  listLedgerEntries,
  listLedgerPostingBatches,
  lockAccountingPeriod,
  unlockAccountingPeriod,
  closeIncomeRoute
} from "../modules/ledger/routes.js";
import {
  createOpeningBalancesRoute,
  deleteOpeningBalancesRoute,
  getOpeningBalancesRoute
} from "../modules/ledger/opening-balance.routes.js";
import {
  balanceCheckRoute,
  closeFiscalYearRoute,
  listFiscalYearsRoute
} from "../modules/ledger/fiscal-year.routes.js";
import {
  getChairmanReportSummary,
  createReportSnapshot,
  getReportDiff,
  getBalanceSheet,
  getCashFlow,
  getPrintableReport,
  getProfitStatement,
  listReportSnapshots
} from "../modules/reports/routes.js";
import { getTrialBalance } from "../modules/reports/trial-balance.routes.js";
import {
  createRecurringRoute,
  generateRecurringRoute,
  listRecurringRoute,
  updateRecurringStatusRoute
} from "../modules/recurring/routes.js";
import {
  closeReconciliationRoute,
  getBalanceReconciliationRoute,
  listReconciliationSessionsRoute
} from "../modules/banking/reconciliation-session.routes.js";
import {
  deleteSettlementRoute,
  getAgingRoute,
  getOpenItemsRoute,
  settleRoute
} from "../modules/settlement/routes.js";
import {
  createAssetRoute,
  disposeAssetRoute,
  getTaxDepreciationRoute,
  listAssetsRoute,
  previewDepreciationRoute,
  runDepreciationRoute
} from "../modules/assets/routes.js";
import {
  createRevaluationVoucherRoute,
  listExchangeRatesRoute,
  previewRevaluationRoute,
  upsertExchangeRateRoute
} from "../modules/currency/routes.js";
import { buildClosingPackageExport, buildClosingPackageHtml } from "../modules/packages/closing-bundle.js";
import {
  createRndCostLine,
  createRndProject,
  createRndTimeEntry,
  getRndProjectDetail,
  getRndSuperDeductionPackage,
  listRndProjects
} from "../modules/rnd/routes.js";
import {
  closeRiskFinding,
  listCompanyRiskFindings,
  listRiskClosureRecords,
  listRiskFindings,
  runEventRiskCheck
} from "../modules/risk/routes.js";
import { handleTasksMeta, listTasks, remindTask, updateTask } from "../modules/tasks/routes.js";
import {
  cancelWorkflowCommandRoute,
  createWorkflowCompensationRoute,
  getWorkflowCommandDetailRoute,
  getWorkflowRunDetailRoute,
  listWorkflowCommandsRoute,
  listWorkflowRunsRoute,
  retryWorkflowCommandRoute
} from "../modules/workflows/routes.js";
import {
  createTaxFilingBatch,
  getCorporateIncomeTaxPreparation,
  getIndividualIncomeTaxMaterials,
  getTaxRuleProfile,
  getStampAndSurtaxSummary,
  getTaxWorkingPaperPrintable,
  createTaxpayerProfile,
  getTaxFilingBatchDetail,
  getTaxItemDetail,
  getVatWorkingPaper,
  listTaxFilingBatches,
  listTaxItems,
  listTaxpayerProfiles,
  reviewTaxFilingBatch,
  submitTaxFilingBatch,
  updateTaxItem,
  validateTaxFilingBatch,
  archiveTaxFilingBatch
} from "../modules/tax/routes.js";
import {
  createCostCenterRoute,
  getCostCenterReportRoute,
  listCostCentersRoute,
  updateCostCenterRoute
} from "../modules/cost-center/routes.js";
import { getLedgerVatWorkingPaper } from "../modules/tax/vat-ledger-paper.routes.js";
import {
  createTaxRateRoute,
  expireTaxRateRoute,
  listTaxRatesRoute
} from "../modules/tax/tax-rate.routes.js";
import {
  createVatSettlementVoucher,
  previewVatSettlement
} from "../modules/tax/vat-settlement.routes.js";
import {
  approveVoucher,
  createVoucherFromTemplate,
  getVoucherDetail,
  getVoucherTemplates,
  listVouchers,
  listVoucherPostingRecords,
  postVoucher,
  reverseVoucher,
  validateVoucher,
  updateVoucher
} from "../modules/vouchers/routes.js";
import {
  closeContract,
  createContract,
  getContractDetail,
  getContractEvents,
  listContracts,
  updateContract
} from "../modules/contracts/routes.js";
import {
  computePayroll,
  confirmPayroll,
  createEmployee,
  getPayrollPeriods,
  getPayrollPolicy,
  listEmployees,
  listPayroll,
  listPayrollReviewLedgers,
  syncPayrollReviewLedgers,
  updateEmployee,
  updatePayrollPolicy,
  updateSalaryAccounts
} from "../modules/payroll/routes.js";
import {
  buildBatchRoute,
  listBatchesRoute,
  getBatchRoute,
  approveBatchRoute,
  compensateBatchRoute,
  downloadBatchFileRoute,
  disburseBatchRoute
} from "../modules/payroll/transfer.routes.js";
import { socialSecurityClosureRoute } from "../modules/payroll/social-security.routes.js";
import { syncStatementsRoute, submitTransferApiRoute } from "../modules/banking/bank-api.routes.js";
import { getInbox } from "../modules/inbox/inbox.routes.js";
import { globalSearch } from "../modules/search/search.routes.js";
import { getSetupStatus } from "../modules/setup/setup.routes.js";
import { suggestAccounting, assessEventCompleteness, auditReview, getAiResults, acceptAiResult } from "../modules/ai-agents/routes.js";
import { getCashForecast } from "../modules/forecast/routes.js";
import { getArchivePackage } from "../modules/archive/package.routes.js";
import { submitFeedback, listFeedback, consolidateFeedbackRoute, listProposals, decideProposal } from "../modules/feedback/routes.js";
import { getTaxDeadlines } from "../modules/tax/deadlines.routes.js";
import { listPlans, getSubscription, subscribePlan, confirmPayment, listPayments } from "../modules/billing/routes.js";
import { listCounterparties, createCounterparty, updateCounterparty } from "../modules/counterparties/routes.js";
import { chat as assistantChat, ocr as assistantOcr } from "../modules/assistant/routes.js";
import {
  payrollPdf,
  payrollSlipPdf,
  reportPdf,
  voucherPdf
} from "../modules/pdf/routes.js";
import {
  createExportJob,
  listExportArchiveEntries,
  listExportJobs,
  updateExportJobStatus
} from "../modules/exports/routes.js";
import {
  getPayrollRuntimeSummaryRoute,
  getPayrollTransferRuntimeSummaryRoute,
  getTaskRuntimeSummaryRoute,
  getTaxRuntimeSummaryRoute,
  getVoucherRuntimeSummaryRoute
} from "../modules/runtime/routes.js";
import { listAuditLogs } from "../modules/audit/routes.js";
import { bossChat } from "../modules/boss-qa/routes.js";
import {
  createKnowledgeItem,
  deleteKnowledgeItem,
  listKnowledgeItems,
  parseKnowledgeDocuments,
  updateKnowledgeItem
} from "../modules/knowledge/routes.js";
import { getRndTrend } from "../modules/rnd/routes.js";
import {
  getAiSettings,
  updateAiSettings,
  getOllamaModels,
  testAiConnection,
  getCompanySettings,
  getUserList,
  updateCompanySettings
} from "../modules/settings/routes.js";
import {
  listIntegrationConfigs,
  getIntegrationConfig,
  upsertIntegrationConfig,
  testIntegrationConfig,
} from "../modules/settings/integration-config.routes.js";
import { login, logout, me, refresh } from "../middleware/auth.js";
import { json } from "../utils/http.js";
import { createRouter, type Router, type RouteDef, type RouteHandler } from "../router/router.js";
// P1 外部系统对接模块
import {
  exportVatXml,
  exportIitCsv,
  exportSiCsv,
  exportFundCsv,
  listSubmissions,
  confirmSubmission,
} from "../modules/tax-integration/declaration-export.routes.js";
import {
  listBankAccounts,
  createBankAccount,
  listBankStatements,
  importBankStatements,
  matchStatement,
  getUnmatchedSummary,
} from "../modules/banking/bank.routes.js";
import {
  runReconciliationRoute,
  listCandidatesRoute,
  confirmCandidateRoute,
  rejectCandidateRoute,
  getReconRulesRoute,
  upsertReconRulesRoute,
} from "../modules/banking/recon.routes.js";
import {
  listInvoices,
  createInvoice,
  updateInvoice,
  verifyInvoice,
  ocrInvoice,
  deleteInvoice,
  generateInvoiceVoucher,
} from "../modules/invoices/invoice.routes.js";
// E1/E2 数据智能
import { cashForecastRoute, revenueComparisonRoute, budgetVarianceRoute } from "../modules/analytics/routes.js";
// H4-w2 异常检测扫描接线
import { anomalyScanRoute } from "../modules/ai-agents/anomaly/anomaly.routes.js";
import { generateCloseDrafts, listCloseDrafts, approveCloseDraft, rejectCloseDraft } from "../modules/ai-agents/close/close-drafts.routes.js";
import { closePlanRoute } from "../modules/ledger/close-plan.routes.js";
import { parseAndStoreEInvoice } from "../modules/invoices/einvoice.routes.js";
import { taxConsistencyRoute } from "../modules/tax-integration/consistency.routes.js";
import { verifyAuditChain } from "../services/audit.js";
import { automationDecisionRoute, automationThresholdsRoute } from "../modules/ai-agents/governance.routes.js";
import { createApiKey, listApiKeys, revokeApiKey, registerWebhook } from "../modules/open-api/credentials.routes.js";
import { listJobs, enqueueJob } from "../modules/jobs/routes.js";
import { listNotificationDeliveries } from "../modules/notifications/routes.js";
import { BODY_SCHEMAS } from "./body-schemas.js";

const healthHandler: RouteHandler = async (_req, res) => {
  let dbOk = false;
  let dbLatencyMs: number | null = null;
  try {
    const t0 = Date.now();
    await query("SELECT 1");
    dbLatencyMs = Date.now() - t0;
    dbOk = true;
  } catch {
    dbOk = false;
  }
  return json(res, dbOk ? 200 : 503, {
    ok: dbOk,
    service: env.appName,
    db: { ok: dbOk, latencyMs: dbLatencyMs },
    uptimeSec: Math.round(process.uptime()),
    timestamp: new Date().toISOString()
  });
};

const bootstrapHandler: RouteHandler = (_req, res) =>
  json(res, 200, {
    appName: env.appName,
    phase: "sprint-0",
    nextTargets: ["business_events", "tasks", "rbac", "chairman_dashboard"]
  });

const closingBundleHandler: RouteHandler = async (req, res) => {
  const url = new URL(req.url || "/", `http://${env.host}:${env.port}`);
  const kind = (url.searchParams.get("kind") || "month_end") as "month_end" | "audit" | "inspection";
  const period = url.searchParams.get("period") || "2026-05";
  const companyId = req.auth!.companyId;
  const snapshotRows = await query<{ id: string }>(
    `
      select id
      from report_snapshots
      where company_id = $1 and period_label = $2
      order by snapshot_date desc, created_at desc
    `,
    [companyId, period]
  );
  const taxBatchRows = await query<{ id: string }>(
    `
      select id
      from tax_filing_batches
      where company_id = $1 and filing_period = $2
      order by created_at desc
    `,
    [companyId, period]
  );
  const rndRows = await query<{ id: string }>(
    `
      select id
      from rnd_projects
      where company_id = $1 and (
        started_on like $2
        or coalesce(ended_on::text, '') like $2
      )
      order by created_at desc
    `,
    [companyId, `${period}%`]
  );
  const findings = await listCompanyRiskFindings(companyId);
  const bundle = buildClosingPackageExport(kind, period, {
    reportSnapshotIds: snapshotRows.map((item) => item.id),
    taxBatchIds: taxBatchRows.map((item) => item.id),
    riskFindingIds: findings
      .filter((item) => item.status === "open" && item.createdAt.startsWith(period.slice(0, 4)))
      .map((item) => item.id),
    rndProjectIds: rndRows.map((item) => item.id)
  });
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(buildClosingPackageHtml(bundle));
};

// Declarative route table — every HTTP route the API serves.
const routes: RouteDef[] = [
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

  // events (specific sub-paths before the /:id catch-all)
  { method: "GET", path: "/api/events", auth: true, permission: "events.view", handler: listEvents },
  { method: "POST", path: "/api/events", auth: true, permission: "events.create", handler: createEvent },
  {
    method: "POST",
    path: "/api/events/:id/analyze",
    auth: true,
    permission: "events.create",
    handler: (req, res, p) => analyzeEvent(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/events/:id/risk-check",
    auth: true,
    permission: { anyOf: ["risk.manage", "tax.manage", "events.create"] },
    handler: (req, res, p) => runEventRiskCheck(req, res, p.id!)
  },
  {
    method: "GET",
    path: "/api/events/:id",
    auth: true,
    permission: "events.view",
    handler: (req, res, p) => getEventDetail(req, res, p.id!)
  },
  {
    method: "PUT",
    path: "/api/events/:id",
    auth: true,
    permission: "events.create",
    handler: (req, res, p) => updateEvent(req, res, p.id!)
  },

  // tasks
  { method: "GET", path: "/api/tasks", auth: true, permission: "tasks.view", handler: listTasks },
  { method: "GET", path: "/api/runtime/tasks", auth: true, permission: "tasks.view", handler: getTaskRuntimeSummaryRoute },
  // 催办与状态变更是两层守护：权限键管「谁能进这个门」，handler 的 canMutateTask
  // 管「进来后能碰谁的任务」。
  // 不能只挂 tasks.view —— 它连纯只读的 role-viewer 都持有，等于任何登录用户都能
  // 改任意任务；也不能只挂 tasks.manage —— 它只有董事长和财务负责人持有，
  // 会计/员工/出纳/税务专员会连自己名下的任务都改不了。
  {
    method: "POST",
    path: "/api/tasks/:id/remind",
    auth: true,
    permission: { anyOf: ["tasks.view", "tasks.manage"] },
    handler: (req, res, p) => remindTask(req, res, p.id!)
  },
  {
    method: "PUT",
    path: "/api/tasks/:id",
    auth: true,
    permission: { anyOf: ["tasks.view", "tasks.manage"] },
    handler: (req, res, p) => updateTask(req, res, p.id!)
  },

  // workflow runtime
  { method: "GET", path: "/api/workflows/runs", auth: true, permission: "workflow.view", handler: listWorkflowRunsRoute },
  {
    method: "GET",
    path: "/api/workflows/runs/:id",
    auth: true,
    permission: "workflow.view",
    handler: (req, res, p) => getWorkflowRunDetailRoute(req, res, p.id!)
  },
  { method: "GET", path: "/api/workflows/commands", auth: true, permission: "workflow.view", handler: listWorkflowCommandsRoute },
  {
    method: "GET",
    path: "/api/workflows/commands/:id",
    auth: true,
    permission: "workflow.view",
    handler: (req, res, p) => getWorkflowCommandDetailRoute(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/workflows/commands/:id/retry",
    auth: true,
    permission: "workflow.manage",
    handler: (req, res, p) => retryWorkflowCommandRoute(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/workflows/commands/:id/cancel",
    auth: true,
    permission: "workflow.manage",
    handler: (req, res, p) => cancelWorkflowCommandRoute(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/workflows/commands/:id/compensations",
    auth: true,
    permission: "workflow.manage",
    handler: (req, res, p) => createWorkflowCompensationRoute(req, res, p.id!)
  },

  // ledger
  { method: "GET", path: "/api/ledger/entries", auth: true, permission: "ledger.view", handler: listLedgerEntries },
  { method: "GET", path: "/api/ledger/posting-batches", auth: true, permission: "ledger.view", handler: listLedgerPostingBatches },
  { method: "GET", path: "/api/ledger/summary", auth: true, permission: "ledger.view", handler: getLedgerSummary },
  { method: "GET", path: "/api/ledger/balances", auth: true, permission: "ledger.view", handler: getLedgerBalances },
  { method: "GET", path: "/api/ledger/cash-journal", auth: true, permission: "ledger.view", handler: getCashJournal },
  { method: "GET", path: "/api/ledger/periods", auth: true, permission: "ledger.view", handler: listAccountingPeriods },
  {
    method: "POST",
    path: "/api/ledger/periods/:id/lock",
    auth: true,
    permission: "ledger.post",
    handler: (req, res, p) => lockAccountingPeriod(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/ledger/periods/:id/close-income",
    auth: true,
    permission: "ledger.post",
    handler: (req, res, p) => closeIncomeRoute(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/ledger/periods/:id/unlock",
    auth: true,
    permission: "ledger.post",
    handler: (req, res, p) => unlockAccountingPeriod(req, res, p.id!)
  },

  // 期初建账（V12-B4）。录入与撤销都是记账动作 —— 期初余额直接决定所有后续报表的
  // 起点，比新建一张凭证重得多，故挂 ledger.post 而不是 ledger.view。
  { method: "GET", path: "/api/ledger/opening-balances", auth: true, permission: "ledger.view", handler: getOpeningBalancesRoute },
  { method: "POST", path: "/api/ledger/opening-balances", auth: true, permission: "ledger.post", handler: createOpeningBalancesRoute },
  { method: "DELETE", path: "/api/ledger/opening-balances", auth: true, permission: "ledger.post", handler: deleteOpeningBalancesRoute },

  // 会计年度与年末结转（V12-B5）
  { method: "GET", path: "/api/ledger/fiscal-years", auth: true, permission: "ledger.view", handler: listFiscalYearsRoute },
  {
    method: "POST",
    path: "/api/ledger/fiscal-years/:id/close",
    auth: true,
    permission: "ledger.post",
    handler: (req, res, p) => closeFiscalYearRoute(req, res, p.id!)
  },
  // 资产负债表恒等式自检：把「上年未结账」变成报表上看得见的一行，而不是静默错数。
  { method: "GET", path: "/api/ledger/balance-check", auth: true, permission: "ledger.view", handler: balanceCheckRoute },

  // accounts
  { method: "GET", path: "/api/accounts", auth: true, permission: "ledger.view", handler: listAccounts },
  // 科目维护归记账权：建科目会影响所有后续分录的归类，比查看账簿重得多。
  // 不提供 DELETE —— 科目被分录引用过就不能删，只能停用（见 account-store.ts）。
  { method: "POST", path: "/api/accounts", auth: true, permission: "ledger.post", handler: createAccount },
  {
    method: "PATCH",
    path: "/api/accounts/:code",
    auth: true,
    permission: "ledger.post",
    handler: (req, res, p) => updateAccount(req, res, p.code!)
  },
  {
    method: "GET",
    path: "/api/accounts/:code",
    auth: true,
    permission: "ledger.view",
    handler: (req, res, p) => getAccountByCode(req, res, p.code!)
  },

  // 成本中心（V12-D1）
  //
  // 建成本中心归 ledger.post（它决定费用往哪个部门归集，是记账口径的一部分）；
  // 查报表归 ledger.view——部门负责人要能看自己的费用，不该为此拿到记账权限。
  { method: "GET", path: "/api/cost-centers", auth: true, permission: "ledger.view", handler: listCostCentersRoute },
  { method: "POST", path: "/api/cost-centers", auth: true, permission: "ledger.post", handler: createCostCenterRoute },
  {
    method: "PATCH",
    path: "/api/cost-centers/:id",
    auth: true,
    permission: "ledger.post",
    handler: (req, res, p) => updateCostCenterRoute(req, res, p.id!)
  },



  // ── V13-B 申请单 ───────────────────────────────────────────────────
  //
  // 读用 expense.view，写用 expense.submit——两者必须分开：只读角色与审计
  // 要看得到费用标准和别人的单据，但不该能提单。这不是洁癖，是权限护栏
  // 真的抓到了「role-viewer 能建申请单」。
  //
  // 归属收敛在 handler：requesterUserId 固定取 req.auth.userId，提交人永远
  // 是自己；submit/cancel 另在 store 里判「只有发起人能做」。
  { method: "GET", path: "/api/requests", auth: true, permission: "expense.view", handler: listRequestsRoute },
  { method: "POST", path: "/api/requests", auth: true, permission: "expense.submit", handler: createRequestRoute },
  {
    method: "GET",
    path: "/api/requests/:id",
    auth: true,
    permission: "expense.view",
    handler: (req, res, p) => getRequestRoute(req, res, p.id!)
  },
  {
    method: "PATCH",
    path: "/api/requests/:id",
    auth: true,
    permission: "expense.submit",
    handler: (req, res, p) => updateRequestRoute(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/requests/:id/precheck",
    auth: true,
    permission: "expense.view",
    handler: (req, res, p) => precheckRequestRoute(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/requests/:id/transition",
    auth: true,
    permission: "expense.submit",
    handler: (req, res, p) => transitionRequestRoute(req, res, p.id!)
  },


  // ── V13-B 借款单 / 备用金 ────────────────────────────────────────
  //
  // 付款挂 banking.manage 而不是 expense.submit：付款是出纳的本职，
  // 与导流水、做对账同一档。借款人自己不能给自己付款——这是最基本的
  // 不相容职务分离。
  { method: "GET", path: "/api/advances", auth: true, permission: "expense.view", handler: listAdvancesRoute },
  { method: "POST", path: "/api/advances", auth: true, permission: "expense.submit", handler: createAdvanceRoute },
  {
    method: "GET",
    path: "/api/advances/:id",
    auth: true,
    permission: "expense.view",
    handler: (req, res, p) => getAdvanceRoute(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/advances/:id/transition",
    auth: true,
    permission: "expense.submit",
    handler: (req, res, p) => transitionAdvanceRoute(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/advances/:id/pay",
    auth: true,
    permission: "banking.manage",
    handler: (req, res, p) => payAdvanceRoute(req, res, p.id!)
  },


  // ── V13-B 报销单 ───────────────────────────────────────────────────
  { method: "GET", path: "/api/reimbursements", auth: true, permission: "expense.view", handler: listReimbursementsRoute },
  { method: "POST", path: "/api/reimbursements", auth: true, permission: "expense.submit", handler: createReimbursementRoute },
  {
    method: "GET",
    path: "/api/reimbursements/:id",
    auth: true,
    permission: "expense.view",
    handler: (req, res, p) => getReimbursementRoute(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/reimbursements/:id/transition",
    auth: true,
    permission: "expense.submit",
    handler: (req, res, p) => transitionReimbursementRoute(req, res, p.id!)
  },
  // V13-D：业财合规审核。挂 expense.view 而非 submit——审批人要能看到
  // 审核结果，而他未必有提单权限。POST 当查询用（纯计算不落库），
  // 已按规矩登记进 registry-permissions 的白名单。
  {
    method: "POST",
    path: "/api/reimbursements/:id/audit",
    auth: true,
    permission: "expense.view",
    handler: (req, res, p) => auditReimbursementRoute(req, res, p.id!)
  },
  // B5：票据中心的「转报销单」按钮要在点之前就知道这张票报没报过——
  // 挂上去再被拒是最差的顺序。
  {
    method: "GET",
    path: "/api/invoices/:id/reimbursement-usage",
    auth: true,
    permission: "expense.view",
    handler: (req, res, p) => invoiceReimbursementUsageRoute(req, res, p.id!)
  },


  // V13-D6：费用分析。归 expense.view——它读的是报销数据，
  // 与「谁能看别人的报销单」同一层能力。
  { method: "GET", path: "/api/reports/expense-analysis", auth: true, permission: "expense.view", handler: expenseAnalysisRoute },

  // ── V13 残留 7：验收单与三单匹配 ────────────────────────────────
  //
  // 归 contracts.*：验收是合同履行的一环，与付款计划同一授权域。
  // 建验收单要 manage——验收是「另一个人确认东西真的到了」，
  // 不该是任何能看合同的人都能做的事。
  { method: "GET", path: "/api/acceptances", auth: true, permission: "contracts.view", handler: listAcceptancesRoute },
  { method: "POST", path: "/api/acceptances", auth: true, permission: "contracts.manage", handler: createAcceptanceRoute },
  {
    method: "POST",
    path: "/api/acceptances/:id/transition",
    auth: true,
    permission: "contracts.manage",
    handler: (req, res, p) => transitionAcceptanceRoute(req, res, p.id!)
  },
  {
    method: "GET",
    path: "/api/schedules/:id/three-way",
    auth: true,
    permission: "contracts.view",
    handler: (req, res, p) => scheduleThreeWayRoute(req, res, p.id!)
  },

  // ── V13-C 合同付款计划与付款单 ─────────────────────────────────────
  //
  // 付款计划的读写归 contracts.*（它是合同条款的一部分）；
  // 实际付款归 banking.manage（出纳本职，与导流水、做对账同一档）。
  // 这条分界让「谁能改合同条款」与「谁能把钱付出去」是两个人。
  {
    method: "GET",
    path: "/api/contracts/:id/schedules",
    auth: true,
    permission: "contracts.view",
    handler: (req, res, p) => listSchedulesRoute(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/contracts/:id/schedules",
    auth: true,
    permission: "contracts.manage",
    handler: (req, res, p) => createScheduleRoute(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/schedules/:id/cancel",
    auth: true,
    permission: "contracts.manage",
    handler: (req, res, p) => cancelScheduleRoute(req, res, p.id!)
  },
  { method: "GET", path: "/api/payments/due", auth: true, permission: "contracts.view", handler: listDuePaymentsRoute },
  { method: "GET", path: "/api/payments", auth: true, permission: "contracts.view", handler: listPaymentsRoute },
  { method: "POST", path: "/api/payments", auth: true, permission: "banking.manage", handler: createPaymentRoute },
  {
    method: "POST",
    path: "/api/payments/:id/confirm",
    auth: true,
    permission: "banking.manage",
    handler: (req, res, p) => confirmPaymentRoute(req, res, p.id!)
  },
  { method: "POST", path: "/api/payments/export", auth: true, permission: "banking.manage", handler: exportPaymentsRoute },

  // ── V13-A 审批流（终于用上了 workflow.* 权限键）─────────────────────
  //
  // 这两个键在 permissionCatalog 里躺了很久却没有任何路由使用——它们是历史上
  // 给审批流预留的位置。`workflow.view` 覆盖「看流程 + 处理我的待办」，
  // `workflow.manage` 只管改流程定义：改审批链等于改谁能放行多大的钱。
  { method: "GET", path: "/api/approval/flows", auth: true, permission: "workflow.view", handler: listFlowsRoute },
  { method: "POST", path: "/api/approval/flows", auth: true, permission: "workflow.manage", handler: createFlowRoute },
  { method: "GET", path: "/api/approval/pending", auth: true, permission: "workflow.view", handler: listPendingRoute },
  // 抄送给我的（V13 残留 4）。归属收敛在 handler：userId 固定取 req.auth，
  // 只可能看到抄送给自己的。
  { method: "GET", path: "/api/approval/watched", auth: true, permission: "workflow.view", handler: listWatchedRoute },
  {
    method: "POST",
    path: "/api/approval/watched/:id/read",
    auth: true,
    permission: "workflow.view",
    handler: (req, res, p) => markWatchedReadRoute(req, res, p.id!)
  },
  { method: "POST", path: "/api/approval/instances", auth: true, permission: "workflow.view", handler: submitApprovalRoute },
  {
    method: "POST",
    path: "/api/approval/instances/:id/act",
    auth: true,
    permission: "workflow.view",
    handler: (req, res, p) => actOnApprovalRoute(req, res, p.id!)
  },
  {
    method: "GET",
    path: "/api/approval/instances/:id",
    auth: true,
    permission: "workflow.view",
    handler: (req, res, p) => getApprovalDetailRoute(req, res, p.id!)
  },

  // ── V13-A 费控地基：预算与费用标准 ──────────────────────────────────
  //
  // 预算读写分权：`budget.view` 给到部门经理与审计（要看得到执行情况），
  // `budget.manage` 只给财务与管理层。
  { method: "GET", path: "/api/budgets", auth: true, permission: "budget.view", handler: listBudgetsRoute },
  { method: "POST", path: "/api/budgets", auth: true, permission: "budget.manage", handler: createBudgetRoute },
  {
    method: "PATCH",
    path: "/api/budgets/:id",
    auth: true,
    permission: "budget.manage",
    handler: (req, res, p) => updateBudgetRoute(req, res, p.id!)
  },
  {
    method: "DELETE",
    path: "/api/budgets/:id",
    auth: true,
    permission: "budget.manage",
    handler: (req, res, p) => deleteBudgetRoute(req, res, p.id!)
  },
  // 预检挂 budget.view 而不是 manage：提单的人要能看到自己这笔会不会超预算，
  // 但不该因此获得改预算的权限。
  { method: "POST", path: "/api/budgets/check", auth: true, permission: "budget.view", handler: checkBudgetRoute },

  { method: "GET", path: "/api/expense-standards", auth: true, permission: "expense.view", handler: listExpenseStandardsRoute },
  { method: "POST", path: "/api/expense-standards", auth: true, permission: "expense.manage", handler: createExpenseStandardRoute },
  {
    method: "PATCH",
    path: "/api/expense-standards/:id",
    auth: true,
    permission: "expense.manage",
    handler: (req, res, p) => expireExpenseStandardRoute(req, res, p.id!)
  },
  { method: "POST", path: "/api/expense-standards/check", auth: true, permission: "expense.view", handler: checkExpenseStandardRoute },

  { method: "GET", path: "/api/reports/cost-centers", auth: true, permission: "ledger.view", handler: getCostCenterReportRoute },

  // 税率主数据（V12-D2）
  //
  // 查税率归 tax.view；改税率归 tax.manage —— 税率错了整期申报都错，
  // 与录税目不是一个量级的动作。系统内置税率不可运行期修改（沿革由迁移维护），
  // 这里能改的只有公司自定义的那部分。
  { method: "GET", path: "/api/tax/rates", auth: true, permission: "tax.view", handler: listTaxRatesRoute },
  // 账簿口径的增值税底稿：与账簿同源，附带与税目口径的差额
  { method: "GET", path: "/api/tax/vat-working-paper/ledger", auth: true, permission: "tax.view", handler: getLedgerVatWorkingPaper },
  { method: "POST", path: "/api/tax/rates", auth: true, permission: "tax.manage", handler: createTaxRateRoute },
  {
    method: "POST",
    path: "/api/tax/rates/:id/expire",
    auth: true,
    permission: "tax.manage",
    handler: (req, res, p) => expireTaxRateRoute(req, res, p.id!)
  },

  // 定期凭证（V12-C4）
  //
  // 生成的是草稿，不进总账，因此归 ledger.post 而非更高的权限：它省的是
  // 重复劳动，过账仍要走正常审批。
  { method: "GET", path: "/api/recurring-vouchers", auth: true, permission: "ledger.view", handler: listRecurringRoute },
  { method: "POST", path: "/api/recurring-vouchers", auth: true, permission: "ledger.post", handler: createRecurringRoute },
  { method: "POST", path: "/api/recurring-vouchers/generate", auth: true, permission: "ledger.post", handler: generateRecurringRoute },
  {
    method: "PATCH",
    path: "/api/recurring-vouchers/:id",
    auth: true,
    permission: "ledger.post",
    handler: (req, res, p) => updateRecurringStatusRoute(req, res, p.id!)
  },

  // 银行余额调节表与对账封存（V12-C3）
  //
  // 封存归 banking.manage：它是对账动作的收口，与导入流水、确认匹配同一类
  // 职责；查调节表归 ledger.view，出纳之外的人（会计、审计）也要能看。
  { method: "GET", path: "/api/banking/reconciliation/balance", auth: true, permission: "ledger.view", handler: getBalanceReconciliationRoute },
  { method: "GET", path: "/api/banking/reconciliation/sessions", auth: true, permission: "ledger.view", handler: listReconciliationSessionsRoute },
  { method: "POST", path: "/api/banking/reconciliation/close", auth: true, permission: "banking.manage", handler: closeReconciliationRoute },

  // 往来账龄与核销（V12-C2）
  //
  // 核销不产生凭证、不改任何科目余额，只声明"这笔收款抵的是那笔欠款"，
  // 因此归 ledger.post 而非独立权限：它仍是记账人员的日常动作，
  // 而查账龄表的人（如销售、管理层）只要 ledger.view。
  { method: "GET", path: "/api/settlement/aging", auth: true, permission: "ledger.view", handler: getAgingRoute },
  { method: "GET", path: "/api/settlement/open-items", auth: true, permission: "ledger.view", handler: getOpenItemsRoute },
  { method: "POST", path: "/api/settlement/settle", auth: true, permission: "ledger.post", handler: settleRoute },
  {
    method: "DELETE",
    path: "/api/settlement/settlements/:id",
    auth: true,
    permission: "ledger.post",
    handler: (req, res, p) => deleteSettlementRoute(req, res, p.id!)
  },

  // 多币种（V12-D5）。
  //
  // 汇率维护归 ledger.post 而不是单开权限：汇率直接决定折算金额与调汇损益，
  // 改一个数字等于改一笔账，与记账是同一级别的动作。查询归 ledger.view。
  //
  // 调汇生成的是 draft 凭证（与折旧、红冲、增值税结转一致），所以它要的是
  // ledger.post 而非 ledger.approve —— 复核过账仍走凭证自己的审批路径。
  { method: "GET", path: "/api/currency/rates", auth: true, permission: "ledger.view", handler: listExchangeRatesRoute },
  { method: "PUT", path: "/api/currency/rates", auth: true, permission: "ledger.post", handler: upsertExchangeRateRoute },
  { method: "GET", path: "/api/currency/revaluation", auth: true, permission: "ledger.view", handler: previewRevaluationRoute },
  { method: "POST", path: "/api/currency/revaluation", auth: true, permission: "ledger.post", handler: createRevaluationVoucherRoute },

  // 固定资产（V12-C1）
  //
  // 权限沿用 ledger.*：建卡、计提、处置产出的都是凭证，是记账动作；查台账与
  // 预览折旧是查阅动作。不新造 asset.* 权限——权限点越多越难说清谁能干什么，
  // 而这里的动作与"记账/查账"的边界完全重合。
  //
  // 折旧的 GET 路径必须排在 `/api/assets/:id/dispose` 之前登记？不必：两者
  // 方法与形状都不同（GET vs POST，且 depreciation 段不含第二级），不会互相遮蔽。
  { method: "GET", path: "/api/assets", auth: true, permission: "ledger.view", handler: listAssetsRoute },
  { method: "POST", path: "/api/assets", auth: true, permission: "ledger.post", handler: createAssetRoute },
  { method: "GET", path: "/api/assets/depreciation", auth: true, permission: "ledger.view", handler: previewDepreciationRoute },
  // 折旧纳税调整明细表（A105080）：归 tax.view，看它的是做汇算的人
  { method: "GET", path: "/api/assets/tax-depreciation", auth: true, permission: "tax.view", handler: getTaxDepreciationRoute },
  { method: "POST", path: "/api/assets/depreciation", auth: true, permission: "ledger.post", handler: runDepreciationRoute },
  {
    method: "POST",
    path: "/api/assets/:id/dispose",
    auth: true,
    permission: "ledger.post",
    handler: (req, res, p) => disposeAssetRoute(req, res, p.id!)
  },

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

  // documents (specific sub-paths before the /:id catch-all)
  { method: "GET", path: "/api/documents", auth: true, permission: "documents.view", handler: listDocuments },
  {
    method: "POST",
    path: "/api/documents/:id/upload",
    auth: true,
    permission: "documents.manage",
    handler: (req, res, p) => uploadDocumentFile(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/documents/:id/attach",
    auth: true,
    permission: "documents.manage",
    handler: (req, res, p) => attachDocumentFile(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/documents/:id/archive",
    auth: true,
    permission: "documents.manage",
    handler: (req, res, p) => archiveDocument(req, res, p.id!)
  },
  {
    method: "GET",
    path: "/api/documents/:id/attachments",
    auth: true,
    permission: "documents.view",
    handler: (req, res, p) => listDocumentAttachments(req, res, p.id!)
  },
  {
    method: "GET",
    path: "/api/attachments/:id/download",
    auth: true,
    permission: "documents.view",
    handler: (req, res, p) => downloadAttachment(req, res, p.id!)
  },
  {
    method: "GET",
    path: "/api/documents/:id",
    auth: true,
    permission: "documents.view",
    handler: (req, res, p) => getDocumentDetail(req, res, p.id!)
  },
  {
    method: "PUT",
    path: "/api/documents/:id",
    auth: true,
    permission: "documents.manage",
    handler: (req, res, p) => updateDocument(req, res, p.id!)
  },

  // tax
  { method: "GET", path: "/api/tax-items", auth: true, permission: "tax.view", handler: listTaxItems },
  { method: "GET", path: "/api/runtime/tax", auth: true, permission: "tax.view", handler: getTaxRuntimeSummaryRoute },
  { method: "GET", path: "/api/tax-filing-batches", auth: true, permission: "tax.view", handler: listTaxFilingBatches },
  { method: "POST", path: "/api/tax-filing-batches", auth: true, permission: "tax.manage", handler: createTaxFilingBatch },
  { method: "GET", path: "/api/taxpayer-profiles", auth: true, permission: "tax.view", handler: listTaxpayerProfiles },
  { method: "POST", path: "/api/taxpayer-profiles", auth: true, permission: "tax.manage", handler: createTaxpayerProfile },
  { method: "GET", path: "/api/tax/vat-working-paper", auth: true, permission: "tax.view", handler: getVatWorkingPaper },
  { method: "GET", path: "/api/tax/vat-settlement", auth: true, permission: "tax.view", handler: previewVatSettlement },
  { method: "POST", path: "/api/tax/vat-settlement", auth: true, permission: "tax.manage", handler: createVatSettlementVoucher },
  { method: "GET", path: "/api/tax/rules", auth: true, permission: "tax.view", handler: getTaxRuleProfile },
  { method: "GET", path: "/api/tax/individual-income-tax-materials", auth: true, permission: "tax.view", handler: getIndividualIncomeTaxMaterials },
  { method: "GET", path: "/api/tax/stamp-and-surtax-summary", auth: true, permission: "tax.view", handler: getStampAndSurtaxSummary },
  { method: "GET", path: "/api/tax/corporate-income-tax-preparation", auth: true, permission: "tax.view", handler: getCorporateIncomeTaxPreparation },
  { method: "GET", path: "/api/tax/printable", auth: true, permission: "tax.view", handler: getTaxWorkingPaperPrintable },
  {
    method: "POST",
    path: "/api/tax-filing-batches/:id/validate",
    auth: true,
    permission: "tax.manage",
    handler: (req, res, p) => validateTaxFilingBatch(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/tax-filing-batches/:id/review",
    auth: true,
    permission: "tax.manage",
    handler: (req, res, p) => reviewTaxFilingBatch(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/tax-filing-batches/:id/submit",
    auth: true,
    permission: "tax.manage",
    handler: (req, res, p) => submitTaxFilingBatch(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/tax-filing-batches/:id/archive",
    auth: true,
    permission: "tax.manage",
    handler: (req, res, p) => archiveTaxFilingBatch(req, res, p.id!)
  },
  {
    method: "GET",
    path: "/api/tax-filing-batches/:id",
    auth: true,
    permission: "tax.view",
    handler: (req, res, p) => getTaxFilingBatchDetail(req, res, p.id!)
  },
  {
    method: "GET",
    path: "/api/tax-items/:id",
    auth: true,
    permission: "tax.view",
    handler: (req, res, p) => getTaxItemDetail(req, res, p.id!)
  },
  {
    method: "PUT",
    path: "/api/tax-items/:id",
    auth: true,
    permission: "tax.manage",
    handler: (req, res, p) => updateTaxItem(req, res, p.id!)
  },

  // vouchers (templates + specific sub-paths before the /:id catch-all)
  { method: "GET", path: "/api/vouchers", auth: true, permission: "ledger.view", handler: listVouchers },
  { method: "POST", path: "/api/vouchers", auth: true, permission: "ledger.post", handler: createVoucherFromTemplate },
  { method: "GET", path: "/api/runtime/vouchers", auth: true, permission: "ledger.view", handler: getVoucherRuntimeSummaryRoute },
  { method: "GET", path: "/api/packages/closing-bundle", auth: true, permission: "dashboard.view", handler: closingBundleHandler },
  { method: "GET", path: "/api/vouchers/templates", auth: true, permission: "ledger.view", handler: getVoucherTemplates },
  {
    method: "POST",
    path: "/api/vouchers/:id/post",
    auth: true,
    permission: "ledger.post",
    handler: (req, res, p) => postVoucher(req, res, p.id!)
  },
  // 红冲是已过账凭证唯一合法的更正出口（analyze 的硬删路径已被堵成 409）。
  // 生成的是 draft 凭证，仍需人工审核 + 过账，故与记账同级而非更高。
  {
    method: "POST",
    path: "/api/vouchers/:id/reverse",
    auth: true,
    permission: "ledger.post",
    handler: (req, res, p) => reverseVoucher(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/vouchers/:id/approve",
    auth: true,
    permission: "ledger.post",
    handler: (req, res, p) => approveVoucher(req, res, p.id!)
  },
  {
    method: "GET",
    path: "/api/vouchers/:id/validate",
    auth: true,
    permission: "ledger.view",
    handler: (req, res, p) => validateVoucher(req, res, p.id!)
  },
  {
    method: "GET",
    path: "/api/vouchers/:id/posting-records",
    auth: true,
    permission: "ledger.view",
    handler: (req, res, p) => listVoucherPostingRecords(req, res, p.id!)
  },
  {
    method: "GET",
    path: "/api/vouchers/:id",
    auth: true,
    permission: "ledger.view",
    handler: (req, res, p) => getVoucherDetail(req, res, p.id!)
  },
  {
    method: "PUT",
    path: "/api/vouchers/:id",
    auth: true,
    permission: "ledger.post",
    handler: (req, res, p) => updateVoucher(req, res, p.id!)
  },

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

  // contracts
  { method: "GET", path: "/api/contracts", auth: true, permission: "contracts.view", handler: listContracts },
  { method: "POST", path: "/api/contracts", auth: true, permission: "contracts.manage", handler: createContract },
  {
    method: "POST",
    path: "/api/contracts/:id/close",
    auth: true,
    permission: "contracts.manage",
    handler: (req, res, p) => closeContract(req, res, p.id!)
  },
  {
    method: "GET",
    path: "/api/contracts/:id/events",
    auth: true,
    permission: "contracts.view",
    handler: (req, res, p) => getContractEvents(req, res, p.id!)
  },
  {
    method: "GET",
    path: "/api/contracts/:id",
    auth: true,
    permission: "contracts.view",
    handler: (req, res, p) => getContractDetail(req, res, p.id!)
  },
  {
    method: "PUT",
    path: "/api/contracts/:id",
    auth: true,
    permission: "contracts.manage",
    handler: (req, res, p) => updateContract(req, res, p.id!)
  },

  // exports —— 导出/归档属取证类操作，人群与审计查阅一致（chairman/财务负责人/
  // 会计/税务专员/审计），排除 employee/cashier/viewer。
  // 读接口同口径：导出历史与归档索引暴露「谁在什么时候导出了哪些财税资料」，
  // 与写入同属取证面，不能比 POST 松。
  { method: "GET", path: "/api/exports/jobs", auth: true, permission: "audit.view", handler: listExportJobs },
  { method: "POST", path: "/api/exports/jobs", auth: true, permission: "audit.view", handler: createExportJob },
  {
    method: "POST",
    path: "/api/exports/jobs/:id/status",
    auth: true,
    permission: "audit.view",
    handler: (req, res, p) => updateExportJobStatus(req, res, p.id!)
  },
  { method: "GET", path: "/api/exports/archive-index", auth: true, permission: "audit.view", handler: listExportArchiveEntries },

  // pdf export
  { method: "GET", path: "/api/pdf/payroll", auth: true, permission: "payroll.view", handler: payrollPdf },
  { method: "GET", path: "/api/pdf/payroll-slip", auth: true, permission: "payroll.view", handler: payrollSlipPdf },
  { method: "GET", path: "/api/pdf/report", auth: true, permission: "ledger.view", handler: reportPdf },
  {
    method: "GET",
    path: "/api/pdf/voucher/:id",
    auth: true,
    permission: "ledger.view",
    handler: (req, res, p) => voucherPdf(req, res, p.id!)
  },

  // assistant (per-route OPTIONS handled by the global handler at the top)
  // chat 是「POST 当查询用」，不落业务数据；ocr 会上传并解析单据文件，按单据管理权守护。
  { method: "POST", path: "/api/assistant/chat", auth: true, permission: "dashboard.view", streaming: true, handler: assistantChat },
  { method: "POST", path: "/api/assistant/ocr", auth: true, permission: "documents.manage", handler: assistantOcr },

  // audit
  { method: "GET", path: "/api/audit/logs", auth: true, permission: "audit.view", handler: listAuditLogs },

  // boss-qa
  { method: "POST", path: "/api/boss-qa/chat", auth: true, permission: "dashboard.view", streaming: true, handler: bossChat },

  // knowledge (parse-documents + base before the /:id catch-all)
  { method: "POST", path: "/api/knowledge/parse-documents", auth: true, permission: "knowledge.manage", handler: parseKnowledgeDocuments },
  { method: "GET", path: "/api/knowledge", auth: true, permission: "knowledge.view", handler: listKnowledgeItems },
  { method: "POST", path: "/api/knowledge", auth: true, permission: "knowledge.manage", handler: createKnowledgeItem },
  {
    method: "PUT",
    path: "/api/knowledge/:id",
    auth: true,
    permission: "knowledge.manage",
    handler: (req, res, p) => updateKnowledgeItem(req, res, p.id!)
  },
  {
    method: "DELETE",
    path: "/api/knowledge/:id",
    auth: true,
    permission: "knowledge.manage",
    handler: (req, res, p) => deleteKnowledgeItem(req, res, p.id!)
  },

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

  // global search —— 命令面板的全局入口，所有角色都持有 dashboard.view。
  // 注意：它跨事项/合同/发票/凭证/员工/单据聚合，handler 目前不按调用者权限逐类过滤，
  // 只按 company_id 隔离；收紧到单一 *.view 会让命令面板对部分角色整体失效，
  // 逐类过滤应作为后续项在 handler 内做，而不是靠这里的权限键。
  { method: "GET", path: "/api/search", auth: true, permission: "dashboard.view", handler: globalSearch },

  // ai agents (P6)
  // suggest 产出分录建议（记账职责）；assess 面向事项负责人；review 输出全公司风险
  // 勾稽（与审计查阅同人群）；accept 会把 AI 结果标记为采纳，属账务决策。
  { method: "POST", path: "/api/ai/accounting/suggest", auth: true, permission: "ledger.post", handler: suggestAccounting },
  { method: "POST", path: "/api/ai/completeness/assess", auth: true, permission: "events.create", handler: assessEventCompleteness },
  { method: "POST", path: "/api/ai/audit/review", auth: true, permission: "audit.view", handler: auditReview },
  // 一个读接口同时吐三类产物：事项级分录建议、事项完整度评估，以及 audit agent
  // 的全公司勾稽发现（风险等级、未匹配流水、草稿凭证数）。按最敏感的那一类定门槛。
  { method: "GET", path: "/api/ai/results", auth: true, permission: "audit.view", handler: getAiResults },
  {
    method: "POST",
    path: "/api/ai/results/:id/accept",
    auth: true,
    permission: "ledger.post",
    handler: (req, res, p) => acceptAiResult(req, res, p.id!)
  },

  // counterparties (P7) —— 往来单位是合同/发票的主体主数据，按合同管理权守护。
  { method: "GET", path: "/api/counterparties", auth: true, permission: "contracts.view", handler: listCounterparties },
  { method: "POST", path: "/api/counterparties", auth: true, permission: "contracts.manage", handler: createCounterparty },
  {
    method: "PATCH",
    path: "/api/counterparties/:id",
    auth: true,
    permission: "contracts.manage",
    handler: (req, res, p) => updateCounterparty(req, res, p.id!)
  },

  // billing (P8) —— 订阅变更与付款确认属公司治理决策，收归 settings.manage。
  // 读接口同口径：订阅档位、配额用量与付款流水（金额/支付方式/流水号）只服务
  // 「系统中心 → 订阅计费」这一个页面，而该页的菜单键本身就是 settings.manage。
  { method: "GET", path: "/api/billing/plans", auth: true, permission: "settings.manage", handler: listPlans },
  { method: "GET", path: "/api/billing/subscription", auth: true, permission: "settings.manage", handler: getSubscription },
  { method: "POST", path: "/api/billing/subscribe", auth: true, permission: "settings.manage", handler: subscribePlan },
  { method: "GET", path: "/api/billing/payments", auth: true, permission: "settings.manage", handler: listPayments },
  {
    method: "POST",
    path: "/api/billing/payments/:id/confirm",
    auth: true,
    permission: "settings.manage",
    handler: (req, res, p) => confirmPayment(req, res, p.id!)
  },

  // misc single-endpoint domains
  { method: "GET", path: "/api/tax/deadlines", auth: true, permission: "tax.view", handler: getTaxDeadlines },
  // 提交是自助的，读列表不是：listFeedback 返回全公司所有人的反馈（含 user_name +
  // 正文），不按调用者收敛，且只服务「系统中心 → 反馈与升级」这一个页面。
  { method: "GET", path: "/api/feedback", auth: true, permission: "settings.manage", handler: listFeedback },
  // 自助提交：任何登录用户都应能反馈问题；收敛为提案则与 /api/proposals/:id/decide 同级。
  { method: "POST", path: "/api/feedback", auth: true, permission: "dashboard.view", handler: submitFeedback },
  { method: "POST", path: "/api/feedback/consolidate", auth: true, permission: "settings.manage", handler: consolidateFeedbackRoute },
  // 升级提案的读写同页同权：列表已含决策人与决策意见。
  { method: "GET", path: "/api/proposals", auth: true, permission: "settings.manage", handler: listProposals },
  {
    method: "POST",
    path: "/api/proposals/:id/decide",
    auth: true,
    permission: "settings.manage",
    handler: (req, res, p) => decideProposal(req, res, p.id!)
  },
  // 财税资料包＝归档产物清单，与 /api/exports/* 同属取证面，故同为 audit.view。
  { method: "GET", path: "/api/archive/package", auth: true, permission: "audit.view", handler: getArchivePackage },
  // 与 /api/analytics/cash-forecast 同源同口径，权限键保持一致。
  { method: "GET", path: "/api/forecast/cash", auth: true, permission: "dashboard.view", handler: getCashForecast },
  { method: "GET", path: "/api/setup/status", auth: true, permission: "dashboard.view", handler: getSetupStatus },
  // 收件箱与月结向导都是跨模块的**计数**聚合，不返回明细；权限键对齐各自页面的
  // 菜单键（/inbox → tasks.view，月结清单归口总账）。
  { method: "GET", path: "/api/inbox", auth: true, permission: "tasks.view", handler: getInbox },

  // invoices (P1) — ocr + sub-paths before the /:id catch-all
  // 发票录入/识别/验真与既有的 /api/invoices/parse 对齐到 documents.manage；
  // 删除是销毁税务凭据，按记账权（ledger.post）守护，不与录入同级。
  { method: "GET", path: "/api/invoices", auth: true, permission: "documents.view", handler: listInvoices },
  { method: "POST", path: "/api/invoices", auth: true, permission: "documents.manage", handler: createInvoice },
  { method: "POST", path: "/api/invoices/ocr", auth: true, permission: "documents.manage", handler: ocrInvoice },
  // 数电票结构化解析入库（须在 /api/invoices/:id catch-all 之前注册）
  { method: "POST", path: "/api/invoices/parse", auth: true, permission: "documents.manage", handler: parseAndStoreEInvoice },
  {
    method: "POST",
    path: "/api/invoices/:id/verify",
    auth: true,
    permission: "documents.manage",
    handler: (req, res, p) => verifyInvoice(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/invoices/:id/voucher",
    auth: true,
    permission: "ledger.post",
    handler: (req, res, p) => generateInvoiceVoucher(req, res, p.id!)
  },
  {
    method: "PATCH",
    path: "/api/invoices/:id",
    auth: true,
    permission: "documents.manage",
    handler: (req, res, p) => updateInvoice(req, res, p.id!)
  },
  {
    method: "DELETE",
    path: "/api/invoices/:id",
    auth: true,
    permission: "ledger.post",
    handler: (req, res, p) => deleteInvoice(req, res, p.id!)
  },

  // 数据智能（E1/E2）
  { method: "GET", path: "/api/analytics/cash-forecast", auth: true, permission: "dashboard.view", handler: cashForecastRoute },
  { method: "GET", path: "/api/analytics/revenue-comparison", auth: true, permission: "dashboard.view", handler: revenueComparisonRoute },
  { method: "GET", path: "/api/analytics/budget-variance", auth: true, permission: "dashboard.view", handler: budgetVarianceRoute },

  // H4-w2 异常检测扫描（规则型纯核心接线，只读）
  { method: "GET", path: "/api/anomaly/scan", auth: true, permission: "risk.view", handler: anomalyScanRoute },

  // H2-w2 月结编排（只读）
  { method: "GET", path: "/api/ledger/close-plan", auth: true, permission: "ledger.view", handler: closePlanRoute },

  // H1-w2 草稿队列 draft-then-approve（generate/list/approve/reject；静态路径在 :id 之前）
  { method: "POST", path: "/api/close/drafts/generate", auth: true, permission: "ledger.post", handler: generateCloseDrafts },
  { method: "GET", path: "/api/close/drafts", auth: true, permission: "ledger.view", handler: listCloseDrafts },
  { method: "POST", path: "/api/close/drafts/:id/approve", auth: true, permission: "ledger.post", handler: (req, res, p) => approveCloseDraft(req, res, p.id!) },
  { method: "POST", path: "/api/close/drafts/:id/reject", auth: true, permission: "ledger.post", handler: (req, res, p) => rejectCloseDraft(req, res, p.id!) },

  // V6 Stage F 接线：票税一致性 / 审计 hash 链校验 / AI 分级决策门 / 开放能力
  { method: "GET", path: "/api/tax-integration/consistency", auth: true, permission: "tax.view", handler: taxConsistencyRoute },
  { method: "GET", path: "/api/audit/verify-chain", auth: true, permission: "audit.view", handler: verifyAuditChain },
  { method: "POST", path: "/api/ai/automation/decide", auth: true, permission: "dashboard.view", handler: automationDecisionRoute,
    bodySchema: { ruleConfidence: { type: "number", required: true, min: 0, max: 1 }, isFinancialMutation: { type: "boolean", required: true }, amountCents: { type: "number", int: true, min: 0 } } },
  { method: "GET", path: "/api/ai/automation/thresholds", auth: true, permission: "dashboard.view", handler: automationThresholdsRoute },
  { method: "POST", path: "/api/settings/api-keys", auth: true, permission: "settings.manage", handler: createApiKey },
  { method: "GET", path: "/api/settings/api-keys", auth: true, permission: "settings.manage", handler: listApiKeys },
  { method: "POST", path: "/api/settings/api-keys/:id/revoke", auth: true, permission: "settings.manage", handler: revokeApiKey },
  { method: "POST", path: "/api/settings/webhooks", auth: true, permission: "settings.manage", handler: registerWebhook,
    bodySchema: { event_type: { type: "string", required: true, min: 1 }, target_url: { type: "string", required: true, min: 1 } } },

  // F5 调度任务队列（可观测 + 手动入队）
  { method: "GET", path: "/api/jobs", auth: true, permission: "workflow.view", handler: listJobs },
  { method: "POST", path: "/api/jobs", auth: true, permission: "workflow.manage", handler: enqueueJob,
    bodySchema: { kind: { type: "string", required: true, min: 1 } } },

  // K5 通知投递可观测：即发即忘的通知失败不进业务响应，这里给出渠道状态与最近投递记录
  { method: "GET", path: "/api/notifications/deliveries", auth: true, permission: "settings.manage",
    handler: listNotificationDeliveries }
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
