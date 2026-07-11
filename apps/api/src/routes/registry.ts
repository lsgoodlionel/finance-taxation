import { env } from "../config/env.js";
import { query } from "../db/client.js";
import { getMenu } from "../modules/access/routes.js";
import { listAccounts, getAccountByCode } from "../modules/accounts/routes.js";
import { handleAuthMeta } from "../modules/auth/routes.js";
import { handleChairmanDashboard } from "../modules/dashboard/routes.js";
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
  unlockAccountingPeriod
} from "../modules/ledger/routes.js";
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
  approveVoucher,
  createVoucherFromTemplate,
  getVoucherDetail,
  getVoucherTemplates,
  listVouchers,
  listVoucherPostingRecords,
  postVoucher,
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
import { getCloseStatus } from "../modules/close/close.routes.js";
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

  // exports (auth only, no permission)
  { method: "GET", path: "/api/exports/jobs", auth: true, handler: listExportJobs },
  { method: "POST", path: "/api/exports/jobs", auth: true, handler: createExportJob },
  {
    method: "POST",
    path: "/api/exports/jobs/:id/status",
    auth: true,
    handler: (req, res, p) => updateExportJobStatus(req, res, p.id!)
  },
  { method: "GET", path: "/api/exports/archive-index", auth: true, handler: listExportArchiveEntries },

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
  { method: "POST", path: "/api/assistant/chat", auth: true, handler: assistantChat },
  { method: "POST", path: "/api/assistant/ocr", auth: true, handler: assistantOcr },

  // audit
  { method: "GET", path: "/api/audit/logs", auth: true, permission: "audit.view", handler: listAuditLogs },

  // boss-qa
  { method: "POST", path: "/api/boss-qa/chat", auth: true, permission: "dashboard.view", handler: bossChat },

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

  // settings
  { method: "GET", path: "/api/settings/company", auth: true, permission: "dashboard.view", handler: getCompanySettings },
  { method: "PUT", path: "/api/settings/company", auth: true, permission: "dashboard.view", handler: updateCompanySettings },
  { method: "GET", path: "/api/settings/ai", auth: true, permission: "dashboard.view", handler: getAiSettings },
  { method: "PUT", path: "/api/settings/ai", auth: true, permission: "dashboard.view", handler: updateAiSettings },
  { method: "GET", path: "/api/settings/ai/ollama-models", auth: true, handler: getOllamaModels },
  { method: "POST", path: "/api/settings/ai/test", auth: true, handler: testAiConnection },
  { method: "GET", path: "/api/settings/users", auth: true, permission: "dashboard.view", handler: getUserList },
  { method: "GET", path: "/api/settings/integrations", auth: true, permission: "dashboard.view", handler: listIntegrationConfigs },
  {
    method: "POST",
    path: "/api/settings/integrations/:type/test",
    auth: true,
    permission: "dashboard.view",
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
    permission: "dashboard.view",
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
  { method: "GET", path: "/api/banking/accounts", auth: true, handler: listBankAccounts },
  { method: "POST", path: "/api/banking/accounts", auth: true, handler: createBankAccount },
  { method: "GET", path: "/api/banking/statements", auth: true, handler: listBankStatements },
  { method: "POST", path: "/api/banking/statements/import", auth: true, handler: importBankStatements },
  { method: "GET", path: "/api/banking/statements/unmatched", auth: true, handler: getUnmatchedSummary },
  {
    method: "PATCH",
    path: "/api/banking/statements/:id/match",
    auth: true,
    handler: (req, res, p) => matchStatement(req, res, p.id!)
  },
  { method: "POST", path: "/api/banking/reconciliation/run", auth: true, handler: runReconciliationRoute },
  { method: "GET", path: "/api/banking/reconciliation/candidates", auth: true, handler: listCandidatesRoute },
  {
    method: "POST",
    path: "/api/banking/reconciliation/candidates/:id/confirm",
    auth: true,
    handler: (req, res, p) => confirmCandidateRoute(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/banking/reconciliation/candidates/:id/reject",
    auth: true,
    handler: (req, res, p) => rejectCandidateRoute(req, res, p.id!)
  },
  { method: "GET", path: "/api/banking/reconciliation/rules", auth: true, handler: getReconRulesRoute },
  { method: "PUT", path: "/api/banking/reconciliation/rules", auth: true, handler: upsertReconRulesRoute },
  { method: "POST", path: "/api/banking/sync-statements", auth: true, handler: syncStatementsRoute },

  // global search
  { method: "GET", path: "/api/search", auth: true, handler: globalSearch },

  // ai agents (P6)
  { method: "POST", path: "/api/ai/accounting/suggest", auth: true, handler: suggestAccounting },
  { method: "POST", path: "/api/ai/completeness/assess", auth: true, handler: assessEventCompleteness },
  { method: "POST", path: "/api/ai/audit/review", auth: true, handler: auditReview },
  { method: "GET", path: "/api/ai/results", auth: true, handler: getAiResults },
  {
    method: "POST",
    path: "/api/ai/results/:id/accept",
    auth: true,
    handler: (req, res, p) => acceptAiResult(req, res, p.id!)
  },

  // counterparties (P7)
  { method: "GET", path: "/api/counterparties", auth: true, handler: listCounterparties },
  { method: "POST", path: "/api/counterparties", auth: true, handler: createCounterparty },
  {
    method: "PATCH",
    path: "/api/counterparties/:id",
    auth: true,
    handler: (req, res, p) => updateCounterparty(req, res, p.id!)
  },

  // billing (P8)
  { method: "GET", path: "/api/billing/plans", auth: true, handler: listPlans },
  { method: "GET", path: "/api/billing/subscription", auth: true, handler: getSubscription },
  { method: "POST", path: "/api/billing/subscribe", auth: true, handler: subscribePlan },
  { method: "GET", path: "/api/billing/payments", auth: true, handler: listPayments },
  {
    method: "POST",
    path: "/api/billing/payments/:id/confirm",
    auth: true,
    handler: (req, res, p) => confirmPayment(req, res, p.id!)
  },

  // misc single-endpoint domains
  { method: "GET", path: "/api/tax/deadlines", auth: true, handler: getTaxDeadlines },
  { method: "GET", path: "/api/feedback", auth: true, handler: listFeedback },
  { method: "POST", path: "/api/feedback", auth: true, handler: submitFeedback },
  { method: "POST", path: "/api/feedback/consolidate", auth: true, handler: consolidateFeedbackRoute },
  { method: "GET", path: "/api/proposals", auth: true, handler: listProposals },
  {
    method: "POST",
    path: "/api/proposals/:id/decide",
    auth: true,
    permission: "settings.manage",
    handler: (req, res, p) => decideProposal(req, res, p.id!)
  },
  { method: "GET", path: "/api/archive/package", auth: true, handler: getArchivePackage },
  { method: "GET", path: "/api/forecast/cash", auth: true, handler: getCashForecast },
  { method: "GET", path: "/api/setup/status", auth: true, handler: getSetupStatus },
  { method: "GET", path: "/api/inbox", auth: true, handler: getInbox },
  { method: "GET", path: "/api/close/status", auth: true, handler: getCloseStatus },

  // invoices (P1) — ocr + sub-paths before the /:id catch-all
  { method: "GET", path: "/api/invoices", auth: true, handler: listInvoices },
  { method: "POST", path: "/api/invoices", auth: true, handler: createInvoice },
  { method: "POST", path: "/api/invoices/ocr", auth: true, handler: ocrInvoice },
  {
    method: "POST",
    path: "/api/invoices/:id/verify",
    auth: true,
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
    handler: (req, res, p) => updateInvoice(req, res, p.id!)
  },
  {
    method: "DELETE",
    path: "/api/invoices/:id",
    auth: true,
    handler: (req, res, p) => deleteInvoice(req, res, p.id!)
  }
];

export function createAppRouter(): Router {
  const appRouter = createRouter();
  for (const route of routes) {
    appRouter.register(route);
  }
  return appRouter;
}
