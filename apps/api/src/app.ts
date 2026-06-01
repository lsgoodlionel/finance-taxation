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
  updatePayrollPolicy
} from "./modules/payroll/routes.js";
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
import { login, logout, me, refresh, requireAuth, requirePermission } from "./middleware/auth.js";
import type { ApiRequest } from "./types.js";
import { json } from "./utils/http.js";
import { readJsonBody } from "./utils/body.js";
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
  listInvoices,
  createInvoice,
  updateInvoice,
  verifyInvoice,
  ocrInvoice,
  deleteInvoice,
} from "./modules/invoices/invoice.routes.js";

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

  const url = new URL(req.url || "/", `http://${env.host}:${env.port}`);
  if (["POST", "PUT", "PATCH"].includes(req.method || "")) {
    const ct = req.headers["content-type"] || "";
    if (!ct.startsWith("multipart/form-data")) {
      req.body = await readJsonBody(req);
    }
  }

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
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("dashboard.view", req, res))) return;
    return handleChairmanDashboard(req, res);
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    return login(req, res);
  }

  if (req.method === "POST" && url.pathname === "/api/auth/refresh") {
    return refresh(req, res);
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    if (!(await requireAuth(req, res))) return;
    return logout(req, res);
  }

  if (req.method === "GET" && url.pathname === "/api/access/me") {
    if (!(await requireAuth(req, res))) return;
    return me(req, res);
  }

  if (req.method === "GET" && url.pathname === "/api/access/menu") {
    if (!(await requireAuth(req, res))) return;
    return getMenu(req, res);
  }

  if (url.pathname === "/api/events") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") {
      if (!(await requirePermission("events.view", req, res))) return;
      return listEvents(req, res);
    }
    if (req.method === "POST") {
      if (!(await requirePermission("events.create", req, res))) return;
      return createEvent(req, res);
    }
  }

  const eventAnalyzeMatch = url.pathname.match(/^\/api\/events\/([^/]+)\/analyze$/);
  const eventAnalyzeId = eventAnalyzeMatch?.[1];
  if (eventAnalyzeId) {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "POST") {
      if (!(await requirePermission("events.create", req, res))) return;
      return analyzeEvent(req, res, eventAnalyzeId);
    }
  }

  const eventRiskCheckMatch = url.pathname.match(/^\/api\/events\/([^/]+)\/risk-check$/);
  const eventRiskCheckId = eventRiskCheckMatch?.[1];
  if (eventRiskCheckId) {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "POST") {
      if (!(await requirePermission("risk.manage", req, res))) return;
      return runEventRiskCheck(req, res, eventRiskCheckId);
    }
  }

  const eventDetailMatch = url.pathname.match(/^\/api\/events\/([^/]+)$/);
  const eventDetailId = eventDetailMatch?.[1];
  if (eventDetailId) {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") {
      if (!(await requirePermission("events.view", req, res))) return;
      return getEventDetail(req, res, eventDetailId);
    }
    if (req.method === "PUT") {
      if (!(await requirePermission("events.create", req, res))) return;
      return updateEvent(req, res, eventDetailId);
    }
  }

  if (url.pathname === "/api/tasks") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") {
      if (!(await requirePermission("tasks.view", req, res))) return;
      return listTasks(req, res);
    }
  }

  const taskRemindMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/remind$/);
  const taskRemindId = taskRemindMatch?.[1];
  if (taskRemindId) {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "POST") {
      if (!(await requirePermission("tasks.view", req, res))) return;
      return remindTask(req, res, taskRemindId);
    }
  }

  const taskIdMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
  const taskId = taskIdMatch?.[1];
  if (taskId) {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "PUT") {
      if (!(await requirePermission("tasks.view", req, res))) return;
      return updateTask(req, res, taskId);
    }
  }

  if (url.pathname === "/api/ledger/entries") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("ledger.view", req, res))) return;
    if (req.method === "GET") return listLedgerEntries(req, res);
  }

  if (url.pathname === "/api/ledger/posting-batches") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("ledger.view", req, res))) return;
    if (req.method === "GET") return listLedgerPostingBatches(req, res);
  }

  if (url.pathname === "/api/ledger/summary") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("ledger.view", req, res))) return;
    if (req.method === "GET") return getLedgerSummary(req, res);
  }

  if (url.pathname === "/api/ledger/balances") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("ledger.view", req, res))) return;
    if (req.method === "GET") return getLedgerBalances(req, res);
  }

  if (url.pathname === "/api/ledger/cash-journal") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("ledger.view", req, res))) return;
    if (req.method === "GET") return getCashJournal(req, res);
  }

  if (url.pathname === "/api/ledger/periods") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("ledger.view", req, res))) return;
    if (req.method === "GET") return listAccountingPeriods(req, res);
  }

  const periodLockMatch = url.pathname.match(/^\/api\/ledger\/periods\/([^/]+)\/lock$/);
  const periodLockId = periodLockMatch?.[1];
  if (periodLockId) {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("ledger.post", req, res))) return;
    if (req.method === "POST") return lockAccountingPeriod(req, res, decodeURIComponent(periodLockId));
  }

  const periodUnlockMatch = url.pathname.match(/^\/api\/ledger\/periods\/([^/]+)\/unlock$/);
  const periodUnlockId = periodUnlockMatch?.[1];
  if (periodUnlockId) {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("ledger.post", req, res))) return;
    if (req.method === "POST") return unlockAccountingPeriod(req, res, decodeURIComponent(periodUnlockId));
  }

  if (url.pathname === "/api/accounts") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("ledger.view", req, res))) return;
    if (req.method === "GET") return listAccounts(req, res);
  }

  const accountCodeMatch = url.pathname.match(/^\/api\/accounts\/([^/]+)$/);
  const accountCode = accountCodeMatch?.[1];
  if (accountCode) {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("ledger.view", req, res))) return;
    if (req.method === "GET") return getAccountByCode(req, res, accountCode);
  }

  if (url.pathname === "/api/reports/balance-sheet") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("ledger.view", req, res))) return;
    if (req.method === "GET") return getBalanceSheet(req, res);
  }

  if (url.pathname === "/api/reports/profit-statement") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("ledger.view", req, res))) return;
    if (req.method === "GET") return getProfitStatement(req, res);
  }

  if (url.pathname === "/api/reports/cash-flow") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("ledger.view", req, res))) return;
    if (req.method === "GET") return getCashFlow(req, res);
  }

  if (url.pathname === "/api/reports/snapshots") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("ledger.view", req, res))) return;
    if (req.method === "GET") return listReportSnapshots(req, res);
    if (req.method === "POST") return createReportSnapshot(req, res);
  }

  if (url.pathname === "/api/reports/diff") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("ledger.view", req, res))) return;
    if (req.method === "GET") return getReportDiff(req, res);
  }

  if (url.pathname === "/api/reports/chairman-summary") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("dashboard.view", req, res))) return;
    if (req.method === "GET") return getChairmanReportSummary(req, res);
  }

  if (url.pathname === "/api/reports/printable") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("ledger.view", req, res))) return;
    if (req.method === "GET") return getPrintableReport(req, res);
  }

  if (req.method === "GET" && url.pathname === "/api/rnd/trend") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("rnd.view", req, res))) return;
    return getRndTrend(req, res);
  }

  if (url.pathname === "/api/rnd/projects") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") {
      if (!(await requirePermission("rnd.view", req, res))) return;
      return listRndProjects(req, res);
    }
    if (req.method === "POST") {
      if (!(await requirePermission("rnd.manage", req, res))) return;
      return createRndProject(req, res);
    }
  }

  const rndProjectDetailMatch = url.pathname.match(/^\/api\/rnd\/projects\/([^/]+)$/);
  const rndProjectDetailId = rndProjectDetailMatch?.[1];
  if (rndProjectDetailId) {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("rnd.view", req, res))) return;
    if (req.method === "GET") return getRndProjectDetail(req, res, rndProjectDetailId);
  }

  const rndPackageMatch = url.pathname.match(/^\/api\/rnd\/projects\/([^/]+)\/super-deduction-package$/);
  const rndPackageProjectId = rndPackageMatch?.[1];
  if (rndPackageProjectId) {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("rnd.view", req, res))) return;
    if (req.method === "GET") return getRndSuperDeductionPackage(req, res, rndPackageProjectId);
  }

  const rndCostLineMatch = url.pathname.match(/^\/api\/rnd\/projects\/([^/]+)\/cost-lines$/);
  const rndCostLineProjectId = rndCostLineMatch?.[1];
  if (rndCostLineProjectId) {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("rnd.manage", req, res))) return;
    if (req.method === "POST") return createRndCostLine(req, res, rndCostLineProjectId);
  }

  const rndTimeEntryMatch = url.pathname.match(/^\/api\/rnd\/projects\/([^/]+)\/time-entries$/);
  const rndTimeEntryProjectId = rndTimeEntryMatch?.[1];
  if (rndTimeEntryProjectId) {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("rnd.manage", req, res))) return;
    if (req.method === "POST") return createRndTimeEntry(req, res, rndTimeEntryProjectId);
  }

  if (url.pathname === "/api/risk/findings") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("risk.view", req, res))) return;
    if (req.method === "GET") return listRiskFindings(req, res);
  }

  const riskCloseMatch = url.pathname.match(/^\/api\/risk\/findings\/([^/]+)\/close$/);
  const riskCloseId = riskCloseMatch?.[1];
  if (riskCloseId) {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("risk.manage", req, res))) return;
    if (req.method === "POST") return closeRiskFinding(req, res, riskCloseId);
  }

  const riskHistoryMatch = url.pathname.match(/^\/api\/risk\/findings\/([^/]+)\/closures$/);
  const riskHistoryId = riskHistoryMatch?.[1];
  if (riskHistoryId) {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("risk.view", req, res))) return;
    if (req.method === "GET") return listRiskClosureRecords(req, res, riskHistoryId);
  }

  if (url.pathname === "/api/documents") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("documents.view", req, res))) return;
    if (req.method === "GET") return listDocuments(req, res);
  }

  const documentUploadMatch = url.pathname.match(/^\/api\/documents\/([^/]+)\/upload$/);
  const documentUploadId = documentUploadMatch?.[1];
  if (documentUploadId) {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "POST") {
      if (!(await requirePermission("documents.manage", req, res))) return;
      return uploadDocumentFile(req, res, documentUploadId);
    }
  }

  const documentAttachMatch = url.pathname.match(/^\/api\/documents\/([^/]+)\/attach$/);
  const documentAttachId = documentAttachMatch?.[1];
  if (documentAttachId) {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "POST") {
      if (!(await requirePermission("documents.manage", req, res))) return;
      return attachDocumentFile(req, res, documentAttachId);
    }
  }

  const documentArchiveMatch = url.pathname.match(/^\/api\/documents\/([^/]+)\/archive$/);
  const documentArchiveId = documentArchiveMatch?.[1];
  if (documentArchiveId) {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "POST") {
      if (!(await requirePermission("documents.manage", req, res))) return;
      return archiveDocument(req, res, documentArchiveId);
    }
  }

  const documentAttachmentsMatch = url.pathname.match(/^\/api\/documents\/([^/]+)\/attachments$/);
  const documentAttachmentsId = documentAttachmentsMatch?.[1];
  if (documentAttachmentsId) {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("documents.view", req, res))) return;
    if (req.method === "GET") return listDocumentAttachments(req, res, documentAttachmentsId);
  }

  const attachmentDownloadMatch = url.pathname.match(/^\/api\/attachments\/([^/]+)\/download$/);
  const attachmentDownloadId = attachmentDownloadMatch?.[1];
  if (attachmentDownloadId) {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("documents.view", req, res))) return;
    if (req.method === "GET") return downloadAttachment(req, res, attachmentDownloadId);
  }

  const documentDetailMatch = url.pathname.match(/^\/api\/documents\/([^/]+)$/);
  const documentDetailId = documentDetailMatch?.[1];
  if (documentDetailId) {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") {
      if (!(await requirePermission("documents.view", req, res))) return;
      return getDocumentDetail(req, res, documentDetailId);
    }
    if (req.method === "PUT") {
      if (!(await requirePermission("documents.manage", req, res))) return;
      return updateDocument(req, res, documentDetailId);
    }
  }

  if (url.pathname === "/api/tax-items") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("tax.view", req, res))) return;
    if (req.method === "GET") return listTaxItems(req, res);
  }

  if (url.pathname === "/api/tax-filing-batches") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") {
      if (!(await requirePermission("tax.view", req, res))) return;
      return listTaxFilingBatches(req, res);
    }
    if (req.method === "POST") {
      if (!(await requirePermission("tax.manage", req, res))) return;
      return createTaxFilingBatch(req, res);
    }
  }

  if (url.pathname === "/api/taxpayer-profiles") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") {
      if (!(await requirePermission("tax.view", req, res))) return;
      return listTaxpayerProfiles(req, res);
    }
    if (req.method === "POST") {
      if (!(await requirePermission("tax.manage", req, res))) return;
      return createTaxpayerProfile(req, res);
    }
  }

  if (url.pathname === "/api/tax/vat-working-paper") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("tax.view", req, res))) return;
    if (req.method === "GET") return getVatWorkingPaper(req, res);
  }

  if (url.pathname === "/api/tax/rules") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("tax.view", req, res))) return;
    if (req.method === "GET") return getTaxRuleProfile(req, res);
  }

  if (url.pathname === "/api/tax/individual-income-tax-materials") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("tax.view", req, res))) return;
    if (req.method === "GET") return getIndividualIncomeTaxMaterials(req, res);
  }

  if (url.pathname === "/api/tax/stamp-and-surtax-summary") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("tax.view", req, res))) return;
    if (req.method === "GET") return getStampAndSurtaxSummary(req, res);
  }

  if (url.pathname === "/api/tax/corporate-income-tax-preparation") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("tax.view", req, res))) return;
    if (req.method === "GET") return getCorporateIncomeTaxPreparation(req, res);
  }

  if (url.pathname === "/api/tax/printable") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("tax.view", req, res))) return;
    if (req.method === "GET") return getTaxWorkingPaperPrintable(req, res);
  }

  const taxFilingBatchValidateMatch = url.pathname.match(/^\/api\/tax-filing-batches\/([^/]+)\/validate$/);
  const taxFilingBatchValidateId = taxFilingBatchValidateMatch?.[1];
  if (taxFilingBatchValidateId) {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "POST") {
      if (!(await requirePermission("tax.manage", req, res))) return;
      return validateTaxFilingBatch(req, res, taxFilingBatchValidateId);
    }
  }

  const taxFilingBatchReviewMatch = url.pathname.match(/^\/api\/tax-filing-batches\/([^/]+)\/review$/);
  const taxFilingBatchReviewId = taxFilingBatchReviewMatch?.[1];
  if (taxFilingBatchReviewId) {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "POST") {
      if (!(await requirePermission("tax.manage", req, res))) return;
      return reviewTaxFilingBatch(req, res, taxFilingBatchReviewId);
    }
  }

  const taxFilingBatchSubmitMatch = url.pathname.match(/^\/api\/tax-filing-batches\/([^/]+)\/submit$/);
  const taxFilingBatchSubmitId = taxFilingBatchSubmitMatch?.[1];
  if (taxFilingBatchSubmitId) {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "POST") {
      if (!(await requirePermission("tax.manage", req, res))) return;
      return submitTaxFilingBatch(req, res, taxFilingBatchSubmitId);
    }
  }

  const taxFilingBatchArchiveMatch = url.pathname.match(/^\/api\/tax-filing-batches\/([^/]+)\/archive$/);
  const taxFilingBatchArchiveId = taxFilingBatchArchiveMatch?.[1];
  if (taxFilingBatchArchiveId) {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "POST") {
      if (!(await requirePermission("tax.manage", req, res))) return;
      return archiveTaxFilingBatch(req, res, taxFilingBatchArchiveId);
    }
  }

  const taxFilingBatchDetailMatch = url.pathname.match(/^\/api\/tax-filing-batches\/([^/]+)$/);
  const taxFilingBatchDetailId = taxFilingBatchDetailMatch?.[1];
  if (taxFilingBatchDetailId) {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("tax.view", req, res))) return;
    if (req.method === "GET") return getTaxFilingBatchDetail(req, res, taxFilingBatchDetailId);
  }

  const taxItemDetailMatch = url.pathname.match(/^\/api\/tax-items\/([^/]+)$/);
  const taxItemDetailId = taxItemDetailMatch?.[1];
  if (taxItemDetailId) {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") {
      if (!(await requirePermission("tax.view", req, res))) return;
      return getTaxItemDetail(req, res, taxItemDetailId);
    }
    if (req.method === "PUT") {
      if (!(await requirePermission("tax.manage", req, res))) return;
      return updateTaxItem(req, res, taxItemDetailId);
    }
  }

  if (url.pathname === "/api/vouchers") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") {
      if (!(await requirePermission("ledger.view", req, res))) return;
      return listVouchers(req, res);
    }
    if (req.method === "POST") {
      if (!(await requirePermission("ledger.post", req, res))) return;
      return createVoucherFromTemplate(req, res);
    }
  }

  if (url.pathname === "/api/packages/closing-bundle") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("dashboard.view", req, res))) return;
    if (req.method === "GET") {
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
      return;
    }
  }

  if (url.pathname === "/api/vouchers/templates") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("ledger.view", req, res))) return;
    if (req.method === "GET") return getVoucherTemplates(req, res);
  }

  const voucherPostMatch = url.pathname.match(/^\/api\/vouchers\/([^/]+)\/post$/);
  const voucherPostId = voucherPostMatch?.[1];
  if (voucherPostId) {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "POST") {
      if (!(await requirePermission("ledger.post", req, res))) return;
      return postVoucher(req, res, voucherPostId);
    }
  }

  const voucherApproveMatch = url.pathname.match(/^\/api\/vouchers\/([^/]+)\/approve$/);
  const voucherApproveId = voucherApproveMatch?.[1];
  if (voucherApproveId) {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "POST") {
      if (!(await requirePermission("ledger.post", req, res))) return;
      return approveVoucher(req, res, voucherApproveId);
    }
  }

  const voucherValidateMatch = url.pathname.match(/^\/api\/vouchers\/([^/]+)\/validate$/);
  const voucherValidateId = voucherValidateMatch?.[1];
  if (voucherValidateId) {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("ledger.view", req, res))) return;
    if (req.method === "GET") return validateVoucher(req, res, voucherValidateId);
  }

  const voucherPostingRecordsMatch = url.pathname.match(/^\/api\/vouchers\/([^/]+)\/posting-records$/);
  const voucherPostingRecordsId = voucherPostingRecordsMatch?.[1];
  if (voucherPostingRecordsId) {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("ledger.view", req, res))) return;
    if (req.method === "GET") return listVoucherPostingRecords(req, res, voucherPostingRecordsId);
  }

  const voucherDetailMatch = url.pathname.match(/^\/api\/vouchers\/([^/]+)$/);
  const voucherDetailId = voucherDetailMatch?.[1];
  if (voucherDetailId) {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") {
      if (!(await requirePermission("ledger.view", req, res))) return;
      return getVoucherDetail(req, res, voucherDetailId);
    }
    if (req.method === "PUT") {
      if (!(await requirePermission("ledger.post", req, res))) return;
      return updateVoucher(req, res, voucherDetailId);
    }
  }

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

  if (url.pathname === "/api/payroll") {
    if (!(await requireAuth(req, res))) return;
    if (!(await requirePermission("payroll.view", req, res))) return;
    if (req.method === "GET") return listPayroll(req, res);
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
}

export function buildApp() {
  return createServer(router);
}
