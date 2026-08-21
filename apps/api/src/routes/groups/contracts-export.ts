/**
 * 路由表分组：合同 / 导出归档 / PDF / 助手 / 审计 / 知识库。
 *
 * 自 `routes/registry.ts` 拆出（V15/P2）。原文件 1787 行里有 1300 行是
 * **一个数组字面量**，任何两个人同时加接口都在同一处冲突。
 */
import type { RouteDef } from "../../router/router.js";
import { chat as assistantChat, ocr as assistantOcr } from "../../modules/assistant/routes.js";
import { chat, ocr } from "../../modules/assistant/routes.js";
import { listAuditLogs } from "../../modules/audit/routes.js";
import { bossChat } from "../../modules/boss-qa/routes.js";
import { closeContract, createContract, getContractDetail, getContractEvents, listContracts, updateContract } from "../../modules/contracts/routes.js";
import { createExportJob, listExportArchiveEntries, listExportJobs, updateExportJobStatus } from "../../modules/exports/routes.js";
import { createKnowledgeItem, deleteKnowledgeItem, listKnowledgeItems, parseKnowledgeDocuments, updateKnowledgeItem } from "../../modules/knowledge/routes.js";
import { payrollPdf, payrollSlipPdf, reportPdf, voucherPdf } from "../../modules/pdf/routes.js";

export const contractsExportRoutes: RouteDef[] = [
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
];
