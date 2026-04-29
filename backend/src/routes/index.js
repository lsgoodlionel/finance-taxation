import { methodNotAllowed, notFound, sendJson } from "../utils/http.js";
import { requireAuth } from "../middleware/auth.js";
import { login, logout, me } from "../modules/auth/handlers.js";
import { getCompanyProfile, updateCompanyProfile } from "../modules/company/handlers.js";
import { createDocument, getDocumentDetail, listDocuments } from "../modules/documents/handlers.js";
import { downloadAttachment, uploadAttachment } from "../modules/attachments/handlers.js";
import { getAccountBalance, getBankJournal, getCashJournal, getDetailLedger, getGeneralLedger } from "../modules/ledger/handlers.js";
import { createTaxpayerProfile, listTaxItems, listTaxpayerProfiles } from "../modules/tax/handlers.js";
import { listReconciliationResults, runReconciliation } from "../modules/reconciliation/handlers.js";
import { createPrintJob, listPrintJobs } from "../modules/print/handlers.js";

export async function router(req, res) {
  const url = new URL(req.url, "http://127.0.0.1");

  if (req.method === "GET" && url.pathname === "/health") {
    return sendJson(res, 200, { ok: true, service: "finance-taxation-backend" });
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    return login(req, res);
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    if (!(await requireAuth(req, res))) return;
    return logout(req, res);
  }

  if (req.method === "GET" && url.pathname === "/api/me") {
    if (!(await requireAuth(req, res))) return;
    return me(req, res);
  }

  if (url.pathname === "/api/company/profile") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") return getCompanyProfile(req, res);
    if (req.method === "PUT") return updateCompanyProfile(req, res);
    return methodNotAllowed(res);
  }

  if (url.pathname === "/api/documents") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") return listDocuments(req, res);
    if (req.method === "POST") return createDocument(req, res);
    return methodNotAllowed(res);
  }

  const documentDetailMatch = url.pathname.match(/^\/api\/documents\/([^/]+)$/);
  if (documentDetailMatch) {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") return getDocumentDetail(req, res, documentDetailMatch[1]);
    return methodNotAllowed(res);
  }

  if (req.method === "POST" && url.pathname === "/api/attachments/upload") {
    if (!(await requireAuth(req, res))) return;
    return uploadAttachment(req, res);
  }

  const attachmentDownloadMatch = url.pathname.match(/^\/api\/attachments\/([^/]+)\/download$/);
  if (attachmentDownloadMatch) {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") return downloadAttachment(req, res, attachmentDownloadMatch[1]);
    return methodNotAllowed(res);
  }

  if (req.method === "GET" && url.pathname === "/api/ledger/general") {
    if (!(await requireAuth(req, res))) return;
    return getGeneralLedger(req, res);
  }

  if (req.method === "GET" && url.pathname === "/api/ledger/detail") {
    if (!(await requireAuth(req, res))) return;
    return getDetailLedger(req, res);
  }

  if (req.method === "GET" && url.pathname === "/api/ledger/account-balance") {
    if (!(await requireAuth(req, res))) return;
    return getAccountBalance(req, res);
  }

  if (req.method === "GET" && url.pathname === "/api/journals/bank") {
    if (!(await requireAuth(req, res))) return;
    return getBankJournal(req, res);
  }

  if (req.method === "GET" && url.pathname === "/api/journals/cash") {
    if (!(await requireAuth(req, res))) return;
    return getCashJournal(req, res);
  }

  if (url.pathname === "/api/company/taxpayer-profiles") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") return listTaxpayerProfiles(req, res);
    if (req.method === "POST") return createTaxpayerProfile(req, res);
    return methodNotAllowed(res);
  }

  if (req.method === "GET" && url.pathname === "/api/tax/items") {
    if (!(await requireAuth(req, res))) return;
    return listTaxItems(req, res);
  }

  if (url.pathname === "/api/reconciliation/run") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "POST") return runReconciliation(req, res);
    return methodNotAllowed(res);
  }

  if (req.method === "GET" && url.pathname === "/api/reconciliation/results") {
    if (!(await requireAuth(req, res))) return;
    return listReconciliationResults(req, res);
  }

  if (url.pathname === "/api/print/jobs") {
    if (!(await requireAuth(req, res))) return;
    if (req.method === "GET") return listPrintJobs(req, res);
    if (req.method === "POST") return createPrintJob(req, res);
    return methodNotAllowed(res);
  }

  return notFound(res);
}
