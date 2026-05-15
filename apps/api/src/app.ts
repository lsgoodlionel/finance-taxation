import { createServer, type ServerResponse } from "node:http";
import { env } from "./config/env.js";
import { getMenu } from "./modules/access/routes.js";
import { listAccounts, getAccountByCode } from "./modules/accounts/routes.js";
import { handleAuthMeta } from "./modules/auth/routes.js";
import { handleChairmanDashboard } from "./modules/dashboard/routes.js";
import {
  attachDocumentFile,
  archiveDocument,
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
  getLedgerBalances,
  getLedgerSummary,
  listLedgerEntries,
  listLedgerPostingBatches
} from "./modules/ledger/routes.js";
import { handleTasksMeta, listTasks } from "./modules/tasks/routes.js";
import {
  createTaxFilingBatch,
  getTaxFilingBatchDetail,
  getTaxItemDetail,
  listTaxFilingBatches,
  listTaxItems,
  submitTaxFilingBatch,
  updateTaxItem,
  validateTaxFilingBatch
} from "./modules/tax/routes.js";
import {
  approveVoucher,
  getVoucherDetail,
  listVouchers,
  listVoucherPostingRecords,
  postVoucher,
  validateVoucher,
  updateVoucher
} from "./modules/vouchers/routes.js";
import { login, me, refresh, requireAuth, requirePermission } from "./middleware/auth.js";
import type { ApiRequest } from "./types.js";
import { json } from "./utils/http.js";
import { readJsonBody } from "./utils/body.js";

async function router(req: ApiRequest, res: ServerResponse) {
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

  const taxFilingBatchValidateMatch = url.pathname.match(/^\/api\/tax-filing-batches\/([^/]+)\/validate$/);
  const taxFilingBatchValidateId = taxFilingBatchValidateMatch?.[1];
  if (taxFilingBatchValidateId) {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "POST") {
      if (!(await requirePermission("tax.manage", req, res))) return;
      return validateTaxFilingBatch(req, res, taxFilingBatchValidateId);
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
    if (!(await requirePermission("ledger.view", req, res))) return;
    if (req.method === "GET") return listVouchers(req, res);
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

  return json(res, 404, { error: "Not Found" });
}

export function buildApp() {
  return createServer(router);
}
