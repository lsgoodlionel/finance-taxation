import { createServer, type ServerResponse } from "node:http";
import { env } from "./config/env.js";
import { query } from "./db/client.js";
import { getMenu } from "./modules/access/routes.js";
import { listAccounts, getAccountByCode } from "./modules/accounts/routes.js";
import { handleAuthMeta } from "./modules/auth/routes.js";
import { handleChairmanDashboard } from "./modules/dashboard/routes.js";
import {
  attachDocumentFile,
  archiveDocument,
  downloadAttachment,
  getDocumentDetail,
  listDocumentAttachments,
  listDocuments,
  updateDocument,
  uploadDocumentFile
} from "./modules/documents/routes.js";
import {
  analyzeEvent,
  createEvent,
  getEventDetail,
  handleEventsMeta,
  listEvents,
  updateEvent
} from "./modules/events/routes.js";
import {
  getCashJournal,
  getLedgerBalances,
  getLedgerSummary,
  listAccountingPeriods,
  listLedgerEntries,
  listLedgerPostingBatches,
  lockAccountingPeriod,
  unlockAccountingPeriod
} from "./modules/ledger/routes.js";
import {
  getChairmanReportSummary,
  createReportSnapshot,
  getReportDiff,
  getBalanceSheet,
  getCashFlow,
  getPrintableReport,
  getProfitStatement,
  listReportSnapshots
} from "./modules/reports/routes.js";
import { buildClosingPackageExport, buildClosingPackageHtml } from "./modules/packages/closing-bundle.js";
import {
  createRndCostLine,
  createRndProject,
  createRndTimeEntry,
  getRndProjectDetail,
  getRndSuperDeductionPackage,
  listRndProjects
} from "./modules/rnd/routes.js";
import {
  closeRiskFinding,
  listCompanyRiskFindings,
  listRiskClosureRecords,
  listRiskFindings,
  runEventRiskCheck
} from "./modules/risk/routes.js";
import { handleTasksMeta, listTasks, remindTask, updateTask } from "./modules/tasks/routes.js";
import {
  cancelWorkflowCommandRoute,
  createWorkflowCompensationRoute,
  getWorkflowCommandDetailRoute,
  getWorkflowRunDetailRoute,
  listWorkflowCommandsRoute,
  listWorkflowRunsRoute,
  retryWorkflowCommandRoute
} from "./modules/workflows/routes.js";
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
} from "./modules/tax/routes.js";
import {
  approveVoucher,
  createVoucherFromTemplate,
  getVoucherDetail,
  getVoucherTemplates,
  listVouchers,
  listVoucherPostingRecords,
  postVoucher,
  validateVoucher,
  updateVoucher
} from "./modules/vouchers/routes.js";
import {
  closeContract,
  createContract,
  getContractDetail,
  getContractEvents,
  listContracts,
  updateContract
} from "./modules/contracts/routes.js";
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
} from "./modules/payroll/routes.js";
import {
  buildBatchRoute,
  listBatchesRoute,
  getBatchRoute,
  approveBatchRoute,
  compensateBatchRoute,
  downloadBatchFileRoute,
  disburseBatchRoute
} from "./modules/payroll/transfer.routes.js";
import { socialSecurityClosureRoute } from "./modules/payroll/social-security.routes.js";
import { syncStatementsRoute, submitTransferApiRoute } from "./modules/banking/bank-api.routes.js";
import { getCloseStatus } from "./modules/close/close.routes.js";
import { getInbox } from "./modules/inbox/inbox.routes.js";
import { globalSearch } from "./modules/search/search.routes.js";
import { getSetupStatus } from "./modules/setup/setup.routes.js";
import { suggestAccounting, assessEventCompleteness, auditReview, getAiResults, acceptAiResult } from "./modules/ai-agents/routes.js";
import { getCashForecast } from "./modules/forecast/routes.js";
import { getArchivePackage } from "./modules/archive/package.routes.js";
import { submitFeedback, listFeedback, consolidateFeedbackRoute, listProposals, decideProposal } from "./modules/feedback/routes.js";
import { getTaxDeadlines } from "./modules/tax/deadlines.routes.js";
import { listPlans, getSubscription, subscribePlan, confirmPayment, listPayments } from "./modules/billing/routes.js";
import { listCounterparties, createCounterparty, updateCounterparty } from "./modules/counterparties/routes.js";
import { chat as assistantChat, ocr as assistantOcr } from "./modules/assistant/routes.js";
import {
  payrollPdf,
  payrollSlipPdf,
  reportPdf,
  voucherPdf
} from "./modules/pdf/routes.js";
import {
  createExportJob,
  listExportArchiveEntries,
  listExportJobs,
  updateExportJobStatus
} from "./modules/exports/routes.js";
import {
  getPayrollRuntimeSummaryRoute,
  getPayrollTransferRuntimeSummaryRoute,
  getTaskRuntimeSummaryRoute,
  getTaxRuntimeSummaryRoute,
  getVoucherRuntimeSummaryRoute
} from "./modules/runtime/routes.js";
import { listAuditLogs } from "./modules/audit/routes.js";
import { bossChat } from "./modules/boss-qa/routes.js";
import {
  createKnowledgeItem,
  deleteKnowledgeItem,
  listKnowledgeItems,
  parseKnowledgeDocuments,
  updateKnowledgeItem
} from "./modules/knowledge/routes.js";
import { getRndTrend } from "./modules/rnd/routes.js";
import {
  getAiSettings,
  updateAiSettings,
  getOllamaModels,
  testAiConnection,
  getCompanySettings,
  getUserList,
  updateCompanySettings
} from "./modules/settings/routes.js";
import {
  listIntegrationConfigs,
  getIntegrationConfig,
  upsertIntegrationConfig,
  testIntegrationConfig,
} from "./modules/settings/integration-config.routes.js";
import { login, logout, me, refresh, requireAnyPermission, requireAuth, requirePermission } from "./middleware/auth.js";
import type { ApiRequest } from "./types.js";
import { json } from "./utils/http.js";
import { readJsonBody, shouldReadJsonBody } from "./utils/body.js";
import { createRouter, type RouteDef, type RouteHandler } from "./router/router.js";
import { dispatch } from "./router/dispatch.js";
import { logger, newRequestId } from "./observability/logger.js";
// P1 外部系统对接模块
import {
  exportVatXml,
  exportIitCsv,
  exportSiCsv,
  exportFundCsv,
  listSubmissions,
  confirmSubmission,
} from "./modules/tax-integration/declaration-export.routes.js";
import {
  listBankAccounts,
  createBankAccount,
  listBankStatements,
  importBankStatements,
  matchStatement,
  getUnmatchedSummary,
} from "./modules/banking/bank.routes.js";
import {
  runReconciliationRoute,
  listCandidatesRoute,
  confirmCandidateRoute,
  rejectCandidateRoute,
  getReconRulesRoute,
  upsertReconRulesRoute,
} from "./modules/banking/recon.routes.js";
import {
  listInvoices,
  createInvoice,
  updateInvoice,
  verifyInvoice,
  ocrInvoice,
  deleteInvoice,
  generateInvoiceVoucher,
} from "./modules/invoices/invoice.routes.js";

const appRouter = createRouter();

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

// Routes migrated off the legacy if-chain into the declarative table.
// The remaining chain below is being progressively moved here (B4).
const migratedRoutes: RouteDef[] = [
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
  {
    method: "POST",
    path: "/api/tasks/:id/remind",
    auth: true,
    permission: "tasks.view",
    handler: (req, res, p) => remindTask(req, res, p.id!)
  },
  {
    method: "PUT",
    path: "/api/tasks/:id",
    auth: true,
    permission: "tasks.view",
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
    path: "/api/ledger/periods/:id/unlock",
    auth: true,
    permission: "ledger.post",
    handler: (req, res, p) => unlockAccountingPeriod(req, res, p.id!)
  },

  // accounts
  { method: "GET", path: "/api/accounts", auth: true, permission: "ledger.view", handler: listAccounts },
  {
    method: "GET",
    path: "/api/accounts/:code",
    auth: true,
    permission: "ledger.view",
    handler: (req, res, p) => getAccountByCode(req, res, p.code!)
  },

  // reports
  { method: "GET", path: "/api/reports/balance-sheet", auth: true, permission: "ledger.view", handler: getBalanceSheet },
  { method: "GET", path: "/api/reports/profit-statement", auth: true, permission: "ledger.view", handler: getProfitStatement },
  { method: "GET", path: "/api/reports/cash-flow", auth: true, permission: "ledger.view", handler: getCashFlow },
  { method: "GET", path: "/api/reports/snapshots", auth: true, permission: "ledger.view", handler: listReportSnapshots },
  { method: "POST", path: "/api/reports/snapshots", auth: true, permission: "ledger.view", handler: createReportSnapshot },
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
  }
];
for (const route of migratedRoutes) {
  appRouter.register(route);
}

async function router(req: ApiRequest, res: ServerResponse) {
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

    // ── Legacy dispatch chain (being migrated into appRouter above) ──

    // events → migrated to appRouter

    // tasks + workflow runtime → migrated to appRouter

    // ledger + accounts + reports + rnd/trend → migrated to appRouter

    // rnd/projects + risk + documents → migrated to appRouter

    // tax family → migrated to appRouter

    // vouchers + closing-bundle → migrated to appRouter

  if (url.pathname === "/api/employees") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") {
      if (!(await requirePermission("payroll.view", req, res))) return;
      return listEmployees(req, res);
    }
    if (req.method === "POST") {
      if (!(await requirePermission("payroll.manage", req, res))) return;
      return createEmployee(req, res);
    }
  }

  const employeeDetailMatch = url.pathname.match(/^\/api\/employees\/([^/]+)$/);
  const employeeDetailId = employeeDetailMatch?.[1];
  if (employeeDetailId) {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "PUT") {
      if (!(await requirePermission("payroll.manage", req, res))) return;
      return updateEmployee(req, res, employeeDetailId);
    }
  }

  if (url.pathname === "/api/payroll/policy") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") {
      if (!(await requirePermission("payroll.view", req, res))) return;
      return getPayrollPolicy(req, res);
    }
    if (req.method === "PUT") {
      if (!(await requirePermission("payroll.manage", req, res))) return;
      return updatePayrollPolicy(req, res);
    }
  }

  if (url.pathname === "/api/payroll/periods") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("payroll.view", req, res))) return;
    if (req.method === "GET") return getPayrollPeriods(req, res);
  }

  // ── P4: 社保联动（工资关账 → 社保申报 + 三险一金凭证）──────────────────────
  const ssClosureMatch = url.pathname.match(/^\/api\/payroll\/periods\/([^/]+)\/social-security-closure$/);
  if (ssClosureMatch?.[1]) {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("payroll.manage", req, res))) return;
    if (req.method === "POST") return socialSecurityClosureRoute(req, res, ssClosureMatch[1]);
  }

  if (url.pathname === "/api/payroll/compute") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("payroll.manage", req, res))) return;
    if (req.method === "POST") return computePayroll(req, res);
  }

  if (url.pathname === "/api/payroll/review-ledgers") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") {
      if (!(await requirePermission("payroll.view", req, res))) return;
      return listPayrollReviewLedgers(req, res);
    }
    if (req.method === "POST") {
      if (!(await requirePermission("payroll.manage", req, res))) return;
      return syncPayrollReviewLedgers(req, res);
    }
  }

  // ── P1-6: 批量维护工资账号 ────────────────────────────────────────────────
  if (url.pathname === "/api/payroll/employees/salary-accounts") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("payroll.manage", req, res))) return;
    if (req.method === "PATCH") {
      await readJsonBody(req);
      return updateSalaryAccounts(req, res);
    }
  }

  // ── P3: 工资代发 ──────────────────────────────────────────────────────────
  if (url.pathname === "/api/payroll/transfer/batches") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") {
      if (!(await requirePermission("payroll.view", req, res))) return;
      return listBatchesRoute(req, res);
    }
    if (req.method === "POST") {
      if (!(await requirePermission("payroll.manage", req, res))) return;
      await readJsonBody(req);
      return buildBatchRoute(req, res);
    }
  }
  if (url.pathname === "/api/runtime/payroll-transfer") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("payroll.view", req, res))) return;
    if (req.method === "GET") return getPayrollTransferRuntimeSummaryRoute(req, res);
  }
  const transferFileMatch = url.pathname.match(/^\/api\/payroll\/transfer\/batches\/([^/]+)\/file$/);
  if (transferFileMatch?.[1]) {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("payroll.view", req, res))) return;
    if (req.method === "GET") return downloadBatchFileRoute(req, res, transferFileMatch[1]);
  }
  const transferApproveMatch = url.pathname.match(/^\/api\/payroll\/transfer\/batches\/([^/]+)\/approve$/);
  if (transferApproveMatch?.[1]) {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("payroll.manage", req, res))) return;
    if (req.method === "POST") return approveBatchRoute(req, res, transferApproveMatch[1]);
  }
  const transferDisburseMatch = url.pathname.match(/^\/api\/payroll\/transfer\/batches\/([^/]+)\/disburse$/);
  if (transferDisburseMatch?.[1]) {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("payroll.manage", req, res))) return;
    if (req.method === "POST") {
      await readJsonBody(req);
      return disburseBatchRoute(req, res, transferDisburseMatch[1]);
    }
  }
  const transferCompensateMatch = url.pathname.match(/^\/api\/payroll\/transfer\/batches\/([^/]+)\/compensate$/);
  if (transferCompensateMatch?.[1]) {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("payroll.manage", req, res))) return;
    if (req.method === "POST") {
      await readJsonBody(req);
      return compensateBatchRoute(req, res, transferCompensateMatch[1]);
    }
  }
  const transferSubmitApiMatch = url.pathname.match(/^\/api\/payroll\/transfer\/batches\/([^/]+)\/submit-api$/);
  if (transferSubmitApiMatch?.[1]) {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("payroll.manage", req, res))) return;
    if (req.method === "POST") {
      await readJsonBody(req);
      return submitTransferApiRoute(req, res, transferSubmitApiMatch[1]);
    }
  }
  const transferBatchMatch = url.pathname.match(/^\/api\/payroll\/transfer\/batches\/([^/]+)$/);
  if (transferBatchMatch?.[1]) {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("payroll.view", req, res))) return;
    if (req.method === "GET") return getBatchRoute(req, res, transferBatchMatch[1]);
  }

  if (url.pathname === "/api/payroll") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("payroll.view", req, res))) return;
    if (req.method === "GET") return listPayroll(req, res);
  }

  if (url.pathname === "/api/runtime/payroll") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("payroll.view", req, res))) return;
    if (req.method === "GET") return getPayrollRuntimeSummaryRoute(req, res);
  }

  const payrollConfirmMatch = url.pathname.match(/^\/api\/payroll\/([^/]+)\/confirm$/);
  const payrollConfirmId = payrollConfirmMatch?.[1];
  if (payrollConfirmId) {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "POST") {
      if (!(await requirePermission("payroll.manage", req, res))) return;
      return confirmPayroll(req, res, payrollConfirmId);
    }
  }

  if (url.pathname === "/api/contracts") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") {
      if (!(await requirePermission("contracts.view", req, res))) return;
      return listContracts(req, res);
    }
    if (req.method === "POST") {
      if (!(await requirePermission("contracts.manage", req, res))) return;
      return createContract(req, res);
    }
  }

  const contractCloseMatch = url.pathname.match(/^\/api\/contracts\/([^/]+)\/close$/);
  const contractCloseId = contractCloseMatch?.[1];
  if (contractCloseId) {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "POST") {
      if (!(await requirePermission("contracts.manage", req, res))) return;
      return closeContract(req, res, contractCloseId);
    }
  }

  const contractEventsMatch = url.pathname.match(/^\/api\/contracts\/([^/]+)\/events$/);
  const contractEventsId = contractEventsMatch?.[1];
  if (contractEventsId) {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("contracts.view", req, res))) return;
    if (req.method === "GET") return getContractEvents(req, res, contractEventsId);
  }

  const contractDetailMatch = url.pathname.match(/^\/api\/contracts\/([^/]+)$/);
  const contractDetailId = contractDetailMatch?.[1];
  if (contractDetailId) {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") {
      if (!(await requirePermission("contracts.view", req, res))) return;
      return getContractDetail(req, res, contractDetailId);
    }
    if (req.method === "PUT") {
      if (!(await requirePermission("contracts.manage", req, res))) return;
      return updateContract(req, res, contractDetailId);
    }
  }

  if (url.pathname === "/api/exports/jobs") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") return listExportJobs(req, res);
    if (req.method === "POST") return createExportJob(req, res);
  }

  const exportStatusMatch = url.pathname.match(/^\/api\/exports\/jobs\/([^/]+)\/status$/);
  if (exportStatusMatch) {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "POST") return updateExportJobStatus(req, res, decodeURIComponent(exportStatusMatch[1]!));
  }

  if (url.pathname === "/api/exports/archive-index") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") return listExportArchiveEntries(req, res);
  }

  // ── PDF Export ──
  if (url.pathname === "/api/pdf/payroll") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("payroll.view", req, res))) return;
    if (req.method === "GET") return payrollPdf(req, res);
  }

  if (url.pathname === "/api/pdf/payroll-slip") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("payroll.view", req, res))) return;
    if (req.method === "GET") return payrollSlipPdf(req, res);
  }

  if (url.pathname === "/api/pdf/report") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("ledger.view", req, res))) return;
    if (req.method === "GET") return reportPdf(req, res);
  }

  const voucherPdfMatch = url.pathname.match(/^\/api\/pdf\/voucher\/([^/]+)$/);
  const voucherPdfId = voucherPdfMatch?.[1];
  if (voucherPdfId) {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("ledger.view", req, res))) return;
    if (req.method === "GET") return voucherPdf(req, res, voucherPdfId);
  }

  // ── Assistant ──
  if (url.pathname === "/api/assistant/chat") {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      });
      res.end();
      return;
    }
    if (req.method === "POST") {
      if (!(await requireAuth(req, res))) return;
      return assistantChat(req, res);
    }
  }

  if (url.pathname === "/api/assistant/ocr") {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      });
      res.end();
      return;
    }
    if (req.method === "POST") {
      if (!(await requireAuth(req, res))) return;
      return assistantOcr(req, res);
    }
  }

  if (req.method === "GET" && url.pathname === "/api/audit/logs") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("audit.view", req, res))) return;
    return listAuditLogs(req, res);
  }

  if (url.pathname === "/api/boss-qa/chat") {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      });
      res.end();
      return;
    }
    if (req.method === "POST") {
      if (!(await requireAuth(req, res))) return;
      if (!(await requirePermission("dashboard.view", req, res))) return;
      return bossChat(req, res);
    }
  }

  // ── Knowledge Base ──
  if (url.pathname === "/api/knowledge/parse-documents") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "POST") {
      if (!(await requirePermission("knowledge.manage", req, res))) return;
      return parseKnowledgeDocuments(req, res);
    }
  }

  if (url.pathname === "/api/knowledge") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") {
      if (!(await requirePermission("knowledge.view", req, res))) return;
      return listKnowledgeItems(req, res);
    }
    if (req.method === "POST") {
      if (!(await requirePermission("knowledge.manage", req, res))) return;
      return createKnowledgeItem(req, res);
    }
  }

  const knowledgeItemMatch = url.pathname.match(/^\/api\/knowledge\/([^/]+)$/);
  const knowledgeItemId = knowledgeItemMatch?.[1];
  if (knowledgeItemId) {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "PUT") {
      if (!(await requirePermission("knowledge.manage", req, res))) return;
      return updateKnowledgeItem(req, res, knowledgeItemId);
    }
    if (req.method === "DELETE") {
      if (!(await requirePermission("knowledge.manage", req, res))) return;
      return deleteKnowledgeItem(req, res, knowledgeItemId);
    }
  }

  // ── Settings ──
  if (url.pathname === "/api/settings/company") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") {
      if (!(await requirePermission("dashboard.view", req, res))) return;
      return getCompanySettings(req, res);
    }
    if (req.method === "PUT") {
      if (!(await requirePermission("dashboard.view", req, res))) return;
      return updateCompanySettings(req, res);
    }
  }

  if (url.pathname === "/api/settings/ai") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("dashboard.view", req, res))) return;
    if (req.method === "GET") return getAiSettings(req, res);
    if (req.method === "PUT") return updateAiSettings(req, res);
  }

  if (url.pathname === "/api/settings/ai/ollama-models") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") return getOllamaModels(req, res);
  }

  if (url.pathname === "/api/settings/ai/test") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "POST") return testAiConnection(req, res);
  }

  if (url.pathname === "/api/settings/users") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("dashboard.view", req, res))) return;
    if (req.method === "GET") return getUserList(req, res);
  }

  // ── P2: 外部对接配置 ─────────────────────────────────────────────────────────
  if (url.pathname === "/api/settings/integrations") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("dashboard.view", req, res))) return;
    if (req.method === "GET") return listIntegrationConfigs(req, res);
  }
  const integrationTypeMatch = url.pathname.match(/^\/api\/settings\/integrations\/([^/]+)$/);
  if (integrationTypeMatch?.[1] && !url.pathname.endsWith("/test")) {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("dashboard.view", req, res))) return;
    const configType = integrationTypeMatch[1];
    if (req.method === "GET") return getIntegrationConfig(req, res, configType);
    if (req.method === "PUT") { await readJsonBody(req); return upsertIntegrationConfig(req, res, configType); }
  }
  const integrationTestMatch = url.pathname.match(/^\/api\/settings\/integrations\/([^/]+)\/test$/);
  if (integrationTestMatch?.[1]) {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("dashboard.view", req, res))) return;
    if (req.method === "POST") return testIntegrationConfig(req, res, integrationTestMatch[1]);
  }

  // ── P1: 税务申报文件导出 ─────────────────────────────────────────────────────
  if (url.pathname === "/api/tax-integration/vat-xml") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("tax.manage", req, res))) return;
    if (req.method === "GET") return exportVatXml(req, res);
  }
  if (url.pathname === "/api/tax-integration/iit-csv") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("tax.manage", req, res))) return;
    if (req.method === "GET") return exportIitCsv(req, res);
  }
  if (url.pathname === "/api/tax-integration/si-csv") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("tax.manage", req, res))) return;
    if (req.method === "GET") return exportSiCsv(req, res);
  }
  if (url.pathname === "/api/tax-integration/fund-csv") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("tax.manage", req, res))) return;
    if (req.method === "GET") return exportFundCsv(req, res);
  }
  if (url.pathname === "/api/tax-integration/submissions") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("tax.view", req, res))) return;
    if (req.method === "GET") return listSubmissions(req, res);
  }
  const submissionConfirmMatch = url.pathname.match(/^\/api\/tax-integration\/submissions\/([^/]+)\/confirm$/);
  if (submissionConfirmMatch?.[1]) {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("tax.manage", req, res))) return;
    if (req.method === "PATCH") return confirmSubmission(req, res, submissionConfirmMatch[1]);
  }

  // ── P1: 银行账户与流水 ────────────────────────────────────────────────────
  if (url.pathname === "/api/banking/accounts") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET")  return listBankAccounts(req, res);
    if (req.method === "POST") {
      await readJsonBody(req);
      return createBankAccount(req, res);
    }
  }
  if (url.pathname === "/api/banking/statements") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") return listBankStatements(req, res);
  }
  if (url.pathname === "/api/banking/statements/import") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "POST") return importBankStatements(req, res);
  }
  if (url.pathname === "/api/banking/statements/unmatched") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") return getUnmatchedSummary(req, res);
  }
  const stmtMatchRoute = url.pathname.match(/^\/api\/banking\/statements\/([^/]+)\/match$/);
  if (stmtMatchRoute?.[1]) {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "PATCH") {
      await readJsonBody(req);
      return matchStatement(req, res, stmtMatchRoute[1]);
    }
  }

  // ── P3: 对账引擎 ──────────────────────────────────────────────────────────
  if (url.pathname === "/api/banking/reconciliation/run") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "POST") {
      await readJsonBody(req);
      return runReconciliationRoute(req, res);
    }
  }
  if (url.pathname === "/api/banking/reconciliation/candidates") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") return listCandidatesRoute(req, res);
  }
  const candidateConfirmRoute = url.pathname.match(/^\/api\/banking\/reconciliation\/candidates\/([^/]+)\/confirm$/);
  if (candidateConfirmRoute?.[1]) {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "POST") return confirmCandidateRoute(req, res, candidateConfirmRoute[1]);
  }
  const candidateRejectRoute = url.pathname.match(/^\/api\/banking\/reconciliation\/candidates\/([^/]+)\/reject$/);
  if (candidateRejectRoute?.[1]) {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "POST") return rejectCandidateRoute(req, res, candidateRejectRoute[1]);
  }
  if (url.pathname === "/api/banking/reconciliation/rules") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") return getReconRulesRoute(req, res);
    if (req.method === "PUT") {
      await readJsonBody(req);
      return upsertReconRulesRoute(req, res);
    }
  }

  // ── 全局搜索 ──────────────────────────────────────────────────────────────
  if (url.pathname === "/api/search") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") return globalSearch(req, res);
  }

  // ── P6: AI Agents ─────────────────────────────────────────────────────────
  if (url.pathname === "/api/ai/accounting/suggest") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "POST") { await readJsonBody(req); return suggestAccounting(req, res); }
  }
  if (url.pathname === "/api/ai/completeness/assess") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "POST") { await readJsonBody(req); return assessEventCompleteness(req, res); }
  }
  if (url.pathname === "/api/ai/audit/review") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "POST") { await readJsonBody(req); return auditReview(req, res); }
  }
  if (url.pathname === "/api/ai/results") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") return getAiResults(req, res);
  }
  const aiAcceptMatch = url.pathname.match(/^\/api\/ai\/results\/([^/]+)\/accept$/);
  if (aiAcceptMatch?.[1]) {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "POST") { await readJsonBody(req); return acceptAiResult(req, res, aiAcceptMatch[1]); }
  }

  // ── P7: 往来单位 ──────────────────────────────────────────────────────────
  if (url.pathname === "/api/counterparties") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") return listCounterparties(req, res);
    if (req.method === "POST") { await readJsonBody(req); return createCounterparty(req, res); }
  }
  const cpMatch = url.pathname.match(/^\/api\/counterparties\/([^/]+)$/);
  if (cpMatch?.[1]) {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "PATCH") { await readJsonBody(req); return updateCounterparty(req, res, cpMatch[1]); }
  }

  // ── P8-C3: 订阅计费 ───────────────────────────────────────────────────────
  if (url.pathname === "/api/billing/plans") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") return listPlans(req, res);
  }
  if (url.pathname === "/api/billing/subscription") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") return getSubscription(req, res);
  }
  if (url.pathname === "/api/billing/subscribe") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "POST") { await readJsonBody(req); return subscribePlan(req, res); }
  }
  if (url.pathname === "/api/billing/payments") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") return listPayments(req, res);
  }
  const payConfirmMatch = url.pathname.match(/^\/api\/billing\/payments\/([^/]+)\/confirm$/);
  if (payConfirmMatch?.[1]) {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "POST") { await readJsonBody(req); return confirmPayment(req, res, payConfirmMatch[1]); }
  }

  // ── P7: 申报到期提醒 ──────────────────────────────────────────────────────
  if (url.pathname === "/api/tax/deadlines") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") return getTaxDeadlines(req, res);
  }

  // ── Phase9 任务2: 反馈与升级需求 ──────────────────────────────────────────
  if (url.pathname === "/api/feedback") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") return listFeedback(req, res);
    if (req.method === "POST") { await readJsonBody(req); return submitFeedback(req, res); }
  }
  if (url.pathname === "/api/feedback/consolidate") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "POST") { await readJsonBody(req); return consolidateFeedbackRoute(req, res); }
  }
  if (url.pathname === "/api/proposals") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") return listProposals(req, res);
  }
  const proposalDecideMatch = url.pathname.match(/^\/api\/proposals\/([^/]+)\/decide$/);
  if (proposalDecideMatch?.[1]) {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("settings.manage", req, res))) return;
    if (req.method === "POST") { await readJsonBody(req); return decideProposal(req, res, proposalDecideMatch[1]); }
  }

  // ── Phase9-F9: 财税资料包 ─────────────────────────────────────────────────
  if (url.pathname === "/api/archive/package") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") return getArchivePackage(req, res);
  }

  // ── P7: 现金流前瞻 ────────────────────────────────────────────────────────
  if (url.pathname === "/api/forecast/cash") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") return getCashForecast(req, res);
  }

  // ── 设置就绪度 ────────────────────────────────────────────────────────────
  if (url.pathname === "/api/setup/status") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") return getSetupStatus(req, res);
  }

  // ── 统一待办收件箱 ────────────────────────────────────────────────────────
  if (url.pathname === "/api/inbox") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") return getInbox(req, res);
  }

  // ── 月度结账状态聚合 ──────────────────────────────────────────────────────
  if (url.pathname === "/api/close/status") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") return getCloseStatus(req, res);
  }

  // ── P5: 银行 API 直连——自动拉流水并对账 ───────────────────────────────────
  if (url.pathname === "/api/banking/sync-statements") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "POST") {
      await readJsonBody(req);
      return syncStatementsRoute(req, res);
    }
  }

  // ── P1: 发票台账 ─────────────────────────────────────────────────────────
  if (url.pathname === "/api/invoices") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") return listInvoices(req, res);
    if (req.method === "POST") {
      await readJsonBody(req);
      return createInvoice(req, res);
    }
  }
  if (url.pathname === "/api/invoices/ocr") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "POST") {
      await readJsonBody(req);
      return ocrInvoice(req, res);
    }
  }
  const invoiceVerifyMatch = url.pathname.match(/^\/api\/invoices\/([^/]+)\/verify$/);
  if (invoiceVerifyMatch?.[1]) {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "POST") return verifyInvoice(req, res, invoiceVerifyMatch[1]);
  }
  const invoiceVoucherMatch = url.pathname.match(/^\/api\/invoices\/([^/]+)\/voucher$/);
  if (invoiceVoucherMatch?.[1]) {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("ledger.post", req, res))) return;
    if (req.method === "POST") return generateInvoiceVoucher(req, res, invoiceVoucherMatch[1]);
  }
  const invoiceDetailMatch = url.pathname.match(/^\/api\/invoices\/([^/]+)$/);
  if (invoiceDetailMatch?.[1]) {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "PATCH") {
      await readJsonBody(req);
      return updateInvoice(req, res, invoiceDetailMatch[1]);
    }
    if (req.method === "DELETE") return deleteInvoice(req, res, invoiceDetailMatch[1]);
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
