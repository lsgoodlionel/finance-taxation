/**
 * 全局搜索（P1-4 命令面板后端）
 * GET /api/search?q=关键词
 *
 * 跨实体模糊搜索：经营事项 / 合同 / 发票 / 凭证 / 员工 / 任务 / 单据。
 * 每类最多返回 5 条，统一结构供前端命令面板直达。
 */

import type { ServerResponse } from "node:http";
import { query } from "../../db/client.js";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";

export interface SearchResult {
  type: string;
  typeLabel: string;
  id: string;
  label: string;
  sublabel: string;
  path: string;
}

const PER_TYPE = 5;

export async function globalSearch(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const q = (url.searchParams.get("q") ?? "").trim();
  const cid = req.auth!.companyId;
  if (q.length < 1) { json(res, 200, { results: [], total: 0 }); return; }

  const like = `%${q}%`;
  const results: SearchResult[] = [];

  // 经营事项
  const events = await query<{ id: string; title: string; type: string; status: string }>(
    `SELECT id, title, type, status FROM business_events
     WHERE company_id=$1 AND title ILIKE $2 ORDER BY created_at DESC LIMIT ${PER_TYPE}`, [cid, like]);
  for (const e of events) results.push({
    type: "event", typeLabel: "事项", id: e.id, label: e.title,
    sublabel: `${e.type} · ${e.status}`, path: "/events",
  });

  // 合同
  const contracts = await query<{ id: string; title: string; counterparty_name: string; contract_no: string }>(
    `SELECT id, title, counterparty_name, contract_no FROM contracts
     WHERE company_id=$1 AND (title ILIKE $2 OR counterparty_name ILIKE $2 OR contract_no ILIKE $2)
     ORDER BY created_at DESC LIMIT ${PER_TYPE}`, [cid, like]);
  for (const c of contracts) results.push({
    type: "contract", typeLabel: "合同", id: c.id, label: c.title,
    sublabel: `${c.counterparty_name} · ${c.contract_no}`, path: "/contracts",
  });

  // 发票
  const invoices = await query<{ id: string; invoice_no: string; seller_name: string; total_amount: string }>(
    `SELECT id, invoice_no, seller_name, total_amount FROM invoices
     WHERE company_id=$1 AND (invoice_no ILIKE $2 OR seller_name ILIKE $2)
     ORDER BY created_at DESC LIMIT ${PER_TYPE}`, [cid, like]);
  for (const i of invoices) results.push({
    type: "invoice", typeLabel: "发票", id: i.id, label: `${i.seller_name}`,
    sublabel: `No.${i.invoice_no} · ¥${Number(i.total_amount).toFixed(2)}`, path: "/invoices",
  });

  // 凭证
  const vouchers = await query<{ id: string; summary: string; status: string }>(
    `SELECT id, summary, status FROM vouchers
     WHERE company_id=$1 AND summary ILIKE $2 ORDER BY created_at DESC LIMIT ${PER_TYPE}`, [cid, like]);
  for (const v of vouchers) results.push({
    type: "voucher", typeLabel: "凭证", id: v.id, label: v.summary,
    sublabel: v.status, path: "/vouchers",
  });

  // 员工
  const employees = await query<{ id: string; name: string; position: string }>(
    `SELECT id, name, position FROM employees
     WHERE company_id=$1 AND name ILIKE $2 ORDER BY name LIMIT ${PER_TYPE}`, [cid, like]);
  for (const e of employees) results.push({
    type: "employee", typeLabel: "员工", id: e.id, label: e.name,
    sublabel: e.position || "员工", path: "/payroll",
  });

  // 任务
  const tasks = await query<{ id: string; title: string; status: string }>(
    `SELECT id, title, status FROM tasks
     WHERE company_id=$1 AND title ILIKE $2 ORDER BY created_at DESC LIMIT ${PER_TYPE}`, [cid, like]);
  for (const t of tasks) results.push({
    type: "task", typeLabel: "任务", id: t.id, label: t.title,
    sublabel: t.status, path: "/tasks",
  });

  // 单据
  const docs = await query<{ id: string; title: string; status: string }>(
    `SELECT id, title, status FROM generated_documents
     WHERE company_id=$1 AND title ILIKE $2 ORDER BY created_at DESC LIMIT ${PER_TYPE}`, [cid, like]);
  for (const d of docs) results.push({
    type: "document", typeLabel: "单据", id: d.id, label: d.title,
    sublabel: d.status, path: "/documents",
  });

  json(res, 200, { results, total: results.length });
}
