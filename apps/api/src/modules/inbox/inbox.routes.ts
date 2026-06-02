/**
 * 统一待办收件箱（P0-3「我的一天」后端）
 * GET /api/inbox
 *
 * 跨模块聚合当前企业的待处理事项，driving 前端「我的一天」工作台。
 */

import type { ServerResponse } from "node:http";
import { queryOne } from "../../db/client.js";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";

export interface InboxItem {
  key: string;
  label: string;
  count: number;
  tone: "warning" | "info";
  actionPath: string;
  hint: string;
}

async function num(sql: string, params: unknown[]): Promise<number> {
  const row = await queryOne<{ n: string }>(sql, params);
  return parseInt(row?.n ?? "0", 10);
}

export async function getInbox(req: ApiRequest, res: ServerResponse): Promise<void> {
  const cid = req.auth!.companyId;

  const [events, todoTasks, overdueTasks, invoices, docs, vouchers, unmatched] = await Promise.all([
    num("SELECT count(*)::text n FROM business_events WHERE company_id=$1 AND status IN ('draft','pending')", [cid]),
    num("SELECT count(*)::text n FROM tasks WHERE company_id=$1 AND status IN ('todo','not_started')", [cid]),
    num("SELECT count(*)::text n FROM tasks WHERE company_id=$1 AND status NOT IN ('done') AND due_at IS NOT NULL AND due_at < now()", [cid]),
    num("SELECT count(*)::text n FROM invoices WHERE company_id=$1 AND verify_status='pending'", [cid]),
    num("SELECT count(*)::text n FROM generated_documents WHERE company_id=$1 AND status='awaiting_upload'", [cid]),
    num("SELECT count(*)::text n FROM vouchers WHERE company_id=$1 AND status='draft'", [cid]),
    num("SELECT count(*)::text n FROM bank_statements WHERE company_id=$1 AND match_status='unmatched'", [cid]),
  ]);

  const items: InboxItem[] = [
    { key: "overdue_tasks", label: "逾期任务", count: overdueTasks, tone: "warning", actionPath: "/tasks", hint: "已过期未完成，请尽快处理" },
    { key: "pending_events", label: "待分析事项", count: events, tone: "info", actionPath: "/events", hint: "经营事项待 AI 分析或确认" },
    { key: "todo_tasks", label: "待开始任务", count: todoTasks, tone: "info", actionPath: "/tasks", hint: "已分派但尚未开始" },
    { key: "pending_invoices", label: "待验真发票", count: invoices, tone: invoices > 0 ? "warning" : "info", actionPath: "/invoices", hint: "进项发票待验真防假" },
    { key: "awaiting_docs", label: "待上传单据附件", count: docs, tone: "info", actionPath: "/documents", hint: "单据资料缺附件" },
    { key: "draft_vouchers", label: "待过账凭证", count: vouchers, tone: "info", actionPath: "/vouchers", hint: "草稿凭证待审核过账" },
    { key: "unmatched_statements", label: "未匹配银行流水", count: unmatched, tone: unmatched > 0 ? "warning" : "info", actionPath: "/banking", hint: "银行流水待对账" },
  ];

  const totalPending = items.reduce((s, i) => s + i.count, 0);
  json(res, 200, { items, totalPending });
}
