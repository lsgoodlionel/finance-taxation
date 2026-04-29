import { readRequestBody, sendJson } from "../../utils/http.js";
import { readJson, writeJson } from "../../services/json-store.js";
import { appConfig } from "../../config/app.js";

const documentsFile = new URL("documents.json", appConfig.dataDir);
const attachmentsFile = new URL("attachments.json", appConfig.dataDir);

const seedDocuments = [
  {
    id: "doc-001",
    companyId: "demo-company",
    code: "FK-202604-0187",
    title: "采购付款申请单",
    documentType: "财务单据",
    category: "采购类",
    businessScene: "采购付款",
    department: "运营部",
    owner: "运营负责人",
    amount: "16800.00",
    documentDate: "2026-04-23",
    status: "draft",
    attachmentIds: []
  }
];

function normalizeDocument(row) {
  return {
    ...row,
    companyId: row.companyId || "demo-company",
    attachmentIds: Array.isArray(row.attachmentIds) ? row.attachmentIds : []
  };
}

export async function listDocuments(req, res) {
  const rows = (await readJson(documentsFile, seedDocuments)).map(normalizeDocument);
  const attachments = await readJson(attachmentsFile, []);
  const scopedRows = rows
    .filter((row) => row.companyId === req.auth.companyId)
    .map((row) => ({
      ...row,
      attachmentCount: attachments.filter((item) => item.documentId === row.id).length
    }));
  sendJson(res, 200, { items: scopedRows, total: scopedRows.length });
}

export async function createDocument(req, res) {
  const body = await readRequestBody(req);
  const rows = (await readJson(documentsFile, seedDocuments)).map(normalizeDocument);
  const next = {
    id: `doc-${Date.now()}`,
    companyId: req.auth.companyId,
    code: body.code || `DOC-${Date.now()}`,
    title: body.title || "未命名单据",
    documentType: body.documentType || "财务单据",
    category: body.category || "通用",
    businessScene: body.businessScene || "通用经营事项",
    department: body.department || "财务部",
    owner: body.owner || "系统生成",
    amount: body.amount || "0.00",
    documentDate: body.documentDate || new Date().toISOString().slice(0, 10),
    status: body.status || "draft",
    attachmentIds: Array.isArray(body.attachmentIds) ? body.attachmentIds : []
  };
  rows.unshift(next);
  await writeJson(documentsFile, rows);
  sendJson(res, 201, next);
}

export async function getDocumentDetail(req, res, documentId) {
  const rows = (await readJson(documentsFile, seedDocuments)).map(normalizeDocument);
  const attachments = await readJson(attachmentsFile, []);
  const document = rows.find((row) => row.id === documentId && row.companyId === req.auth.companyId);
  if (!document) {
    return sendJson(res, 404, { error: "Document not found" });
  }
  return sendJson(res, 200, {
    ...document,
    attachments: attachments.filter((item) => item.documentId === document.id && item.companyId === req.auth.companyId)
  });
}
