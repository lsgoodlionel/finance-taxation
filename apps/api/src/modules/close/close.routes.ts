/**
 * 月度结账状态聚合（P0-2 月度结账向导后端）
 * GET /api/close/status?period=YYYY-MM
 *
 * 跨模块聚合一个会计期间的结账完成度，驱动前端结账向导清单。
 */

import type { ServerResponse } from "node:http";
import { query, queryOne } from "../../db/client.js";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";

export interface CloseStep {
  key: string;
  label: string;
  status: "done" | "pending" | "todo";
  detail: string;
  count: number;
  actionPath: string;
}

async function num(sql: string, params: unknown[]): Promise<number> {
  const row = await queryOne<{ n: string }>(sql, params);
  return parseInt(row?.n ?? "0", 10);
}

export async function getCloseStatus(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const period = url.searchParams.get("period") ?? new Date().toISOString().slice(0, 7);
  const cid = req.auth!.companyId;
  if (!/^\d{4}-\d{2}$/.test(period)) { json(res, 400, { error: "period 格式应为 YYYY-MM" }); return; }

  // 1. 工资确认
  const payHead = await num("SELECT count(*)::text n FROM payroll_records WHERE company_id=$1 AND period=$2", [cid, period]);
  const payDraft = await num("SELECT count(*)::text n FROM payroll_records WHERE company_id=$1 AND period=$2 AND status<>'confirmed'", [cid, period]);

  // 2. 社保关账（P4 事项）
  const ssDone = await num(
    "SELECT count(*)::text n FROM business_events WHERE company_id=$1 AND type='social_security_filing' AND occurred_on=$2::date AND status<>'archived'",
    [cid, `${period}-01`],
  );

  // 3. 凭证过账（本期创建的草稿凭证）
  const voucherDraft = await num(
    "SELECT count(*)::text n FROM vouchers WHERE company_id=$1 AND status='draft' AND to_char(created_at,'YYYY-MM')=$2", [cid, period],
  );

  // 4. 银行对账（本期未匹配流水）
  const unmatched = await num(
    "SELECT count(*)::text n FROM bank_statements WHERE company_id=$1 AND match_status='unmatched' AND to_char(transaction_date,'YYYY-MM')=$2", [cid, period],
  );

  // 5. 财务报表（本期快照）
  const reportSnaps = await num(
    "SELECT count(*)::text n FROM report_snapshots WHERE company_id=$1 AND period_label=$2", [cid, period],
  );

  // 6. 税务申报（本期提交记录）
  const taxSubs = await num(
    "SELECT count(*)::text n FROM tax_declaration_submissions WHERE company_id=$1 AND filing_period=$2", [cid, period],
  );

  // 7. 期间锁账
  const lockRow = await queryOne<{ is_locked: boolean }>(
    "SELECT is_locked FROM accounting_periods WHERE company_id=$1 AND period=$2", [cid, period],
  );
  const locked = lockRow?.is_locked ?? false;

  const steps: CloseStep[] = [
    {
      key: "payroll", label: "工资确认", actionPath: "/payroll",
      status: payHead === 0 ? "todo" : payDraft === 0 ? "done" : "pending",
      count: payDraft,
      detail: payHead === 0 ? "本期暂无工资记录" : payDraft === 0 ? `${payHead} 人已全部确认` : `${payDraft} 人待确认`,
    },
    {
      key: "social_security", label: "社保关账", actionPath: "/payroll/transfer",
      status: ssDone > 0 ? "done" : payDraft === 0 && payHead > 0 ? "pending" : "todo",
      count: ssDone > 0 ? 0 : 1,
      detail: ssDone > 0 ? "已关账并生成三险一金凭证" : "待关账生成社保申报与凭证",
    },
    {
      key: "voucher", label: "凭证过账", actionPath: "/vouchers",
      status: voucherDraft === 0 ? "done" : "pending",
      count: voucherDraft,
      detail: voucherDraft === 0 ? "本期无待过账凭证" : `${voucherDraft} 张草稿凭证待过账`,
    },
    {
      key: "bank_recon", label: "银行对账", actionPath: "/banking",
      status: unmatched === 0 ? "done" : "pending",
      count: unmatched,
      detail: unmatched === 0 ? "本期流水已全部匹配" : `${unmatched} 笔流水未匹配`,
    },
    {
      key: "reports", label: "财务报表", actionPath: "/reports",
      status: reportSnaps > 0 ? "done" : "todo",
      count: reportSnaps,
      detail: reportSnaps > 0 ? `已生成 ${reportSnaps} 张报表快照` : "待生成三大财务报表",
    },
    {
      key: "tax", label: "税务申报", actionPath: "/tax",
      status: taxSubs > 0 ? "done" : "todo",
      count: taxSubs,
      detail: taxSubs > 0 ? `已生成 ${taxSubs} 份申报文件` : "待导出税务申报文件",
    },
    {
      key: "lock", label: "期间锁账", actionPath: "/ledger",
      status: locked ? "done" : "todo",
      count: locked ? 0 : 1,
      detail: locked ? "本期已锁账归档" : "完成上述步骤后锁定账期",
    },
  ];

  const doneCount = steps.filter((s) => s.status === "done").length;
  const canLock = steps.filter((s) => s.key !== "lock").every((s) => s.status === "done");

  json(res, 200, { period, steps, doneCount, total: steps.length, canLock, locked });
}
