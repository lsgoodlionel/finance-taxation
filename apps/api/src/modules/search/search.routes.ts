/**
 * 全局搜索（P1-4 命令面板后端）
 * GET /api/search?q=关键词
 *
 * 跨实体模糊搜索：经营事项 / 合同 / 发票 / 凭证 / 员工 / 任务 / 单据。
 * 每类最多返回 5 条，统一结构供前端命令面板直达。
 *
 * ## P1：按调用者权限逐类过滤
 *
 * 一个月回顾的「发现三」点名这里：**跨六类对象聚合却不按调用者逐类过滤**。
 * 后果是一个只有 `expense.view` 的员工，搜关键词同样能看到合同标题、
 * 凭证摘要、员工姓名——路由上那个权限键挡不住「看到不该看的那一类」。
 *
 * 现在每一类都绑一个权限键，没有那个权限的类**根本不查**（不是查完再滤）：
 * 查完再滤会让数据库白做工，而且一旦哪天有人在过滤前 push 了结果就漏了。
 */

import type { ServerResponse } from "node:http";
import { query } from "../../db/client.js";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { hasPermission } from "../../middleware/auth.js";
import type { PermissionKey } from "@finance-taxation/domain-model";

export interface SearchResult {
  type: string;
  typeLabel: string;
  id: string;
  label: string;
  sublabel: string;
  path: string;
}

const PER_TYPE = 5;

/**
 * 每一类要什么权限才能搜到。
 *
 * 权限键与该类对象所属页面的**读权限**一致——能进那个页面就能搜到它，
 * 不能进就搜不到。用一套口径，用户不会遇到「列表里看得到、搜索里搜不到」
 * 这种自相矛盾的行为。
 */
const TYPE_PERMISSIONS = {
  event: "events.view",
  contract: "contracts.view",
  invoice: "documents.view",
  voucher: "ledger.view",
  employee: "payroll.view",
  task: "tasks.view",
  document: "documents.view"
} as const satisfies Record<string, PermissionKey>;

export async function globalSearch(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const q = (url.searchParams.get("q") ?? "").trim();
  const cid = req.auth!.companyId;
  if (q.length < 1) { json(res, 200, { results: [], total: 0 }); return; }

  const like = `%${q}%`;
  const results: SearchResult[] = [];
  const roleCodes = req.auth!.roleCodes;

  /** 这一类要不要查。**没权限的类根本不查**，不是查完再滤。 */
  const may = (type: keyof typeof TYPE_PERMISSIONS): boolean =>
    hasPermission(roleCodes, TYPE_PERMISSIONS[type]);

  // 经营事项
  const events = !may("event") ? [] : await query<{ id: string; title: string; type: string; status: string }>(
    `SELECT id, title, type, status FROM business_events
     WHERE company_id=$1 AND title ILIKE $2 ORDER BY created_at DESC LIMIT ${PER_TYPE}`, [cid, like]);
  for (const e of events) results.push({
    type: "event", typeLabel: "事项", id: e.id, label: e.title,
    sublabel: `${e.type} · ${e.status}`, path: "/events",
  });

  // 合同
  const contracts = !may("contract") ? [] : await query<{ id: string; title: string; counterparty_name: string; contract_no: string }>(
    `SELECT id, title, counterparty_name, contract_no FROM contracts
     WHERE company_id=$1 AND (title ILIKE $2 OR counterparty_name ILIKE $2 OR contract_no ILIKE $2)
     ORDER BY created_at DESC LIMIT ${PER_TYPE}`, [cid, like]);
  for (const c of contracts) results.push({
    type: "contract", typeLabel: "合同", id: c.id, label: c.title,
    sublabel: `${c.counterparty_name} · ${c.contract_no}`, path: "/contracts",
  });

  // 发票
  const invoices = !may("invoice") ? [] : await query<{ id: string; invoice_no: string; seller_name: string; total_amount: string }>(
    `SELECT id, invoice_no, seller_name, total_amount FROM invoices
     WHERE company_id=$1 AND (invoice_no ILIKE $2 OR seller_name ILIKE $2)
     ORDER BY created_at DESC LIMIT ${PER_TYPE}`, [cid, like]);
  for (const i of invoices) results.push({
    type: "invoice", typeLabel: "发票", id: i.id, label: `${i.seller_name}`,
    sublabel: `No.${i.invoice_no} · ¥${Number(i.total_amount).toFixed(2)}`, path: "/invoices",
  });

  // 凭证
  const vouchers = !may("voucher") ? [] : await query<{ id: string; summary: string; status: string }>(
    `SELECT id, summary, status FROM vouchers
     WHERE company_id=$1 AND summary ILIKE $2 ORDER BY created_at DESC LIMIT ${PER_TYPE}`, [cid, like]);
  for (const v of vouchers) results.push({
    type: "voucher", typeLabel: "凭证", id: v.id, label: v.summary,
    sublabel: v.status, path: "/vouchers",
  });

  // 员工
  const employees = !may("employee") ? [] : await query<{ id: string; name: string; position: string }>(
    `SELECT id, name, position FROM employees
     WHERE company_id=$1 AND name ILIKE $2 ORDER BY name LIMIT ${PER_TYPE}`, [cid, like]);
  for (const e of employees) results.push({
    type: "employee", typeLabel: "员工", id: e.id, label: e.name,
    sublabel: e.position || "员工", path: "/payroll",
  });

  // 任务
  const tasks = !may("task") ? [] : await query<{ id: string; title: string; status: string }>(
    `SELECT id, title, status FROM tasks
     WHERE company_id=$1 AND title ILIKE $2 ORDER BY created_at DESC LIMIT ${PER_TYPE}`, [cid, like]);
  for (const t of tasks) results.push({
    type: "task", typeLabel: "任务", id: t.id, label: t.title,
    sublabel: t.status, path: "/tasks",
  });

  // 单据
  const docs = !may("document") ? [] : await query<{ id: string; title: string; status: string }>(
    `SELECT id, title, status FROM generated_documents
     WHERE company_id=$1 AND title ILIKE $2 ORDER BY created_at DESC LIMIT ${PER_TYPE}`, [cid, like]);
  for (const d of docs) results.push({
    type: "document", typeLabel: "单据", id: d.id, label: d.title,
    sublabel: d.status, path: "/documents",
  });

  json(res, 200, { results, total: results.length });
}
