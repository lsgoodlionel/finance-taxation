import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { query, queryOne, withTransaction } from "../../db/client.js";
import { json } from "../../utils/http.js";
import {
  listCompanyLedgerEntries,
  listCompanyLedgerPostingBatches
} from "../vouchers/routes.js";
import { closePeriod } from "./close-period.js";

const PERIOD_LABEL = /^\d{4}-\d{2}$/;

function periodEndDate(period: string): string {
  const [year, month] = period.split("-").map(Number);
  // Day 0 of the next month is the last day of `month`.
  return new Date(Date.UTC(year!, month!, 0)).toISOString().slice(0, 10);
}

/**
 * POST /api/ledger/periods/:period/close-income — 期末结转损益。
 * Generates and posts the income-summary closing voucher for the period,
 * idempotently. See modules/ledger/close-period.
 */
export async function closeIncomeRoute(
  req: ApiRequest,
  res: ServerResponse,
  period: string
): Promise<void> {
  if (!PERIOD_LABEL.test(period)) {
    json(res, 400, { error: "period must look like YYYY-MM" });
    return;
  }
  const result = await withTransaction((client) =>
    closePeriod(client, {
      companyId: req.auth!.companyId,
      periodLabel: period,
      asOfDate: periodEndDate(period),
      now: new Date().toISOString()
    })
  );
  json(res, result.alreadyClosed ? 200 : 201, result);
}

/**
 * 明细账 / 总账 / 科目余额三个读路径 —— **一律不排除结转损益分录**
 * （口径见 ledger/closing-entries.ts）。
 *
 * 判断依据：它们是「账簿列示」而非「按期间聚合经营成果」。结转分录是真实、
 * 必要的账簿内容，藏起来会让账簿不完整、借贷发生额合计对不上试算平衡；
 * 科目余额表更是要靠它们才能呈现「结转后 6xxx 归零、3131 承载本年利润」这一
 * 正确结果。排除的是重复计量，不是隐藏凭证。
 */
export async function listLedgerEntries(req: ApiRequest, res: ServerResponse) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const voucherId = url.searchParams.get("voucherId") || undefined;
  const eventId = url.searchParams.get("businessEventId") || undefined;
  // 会计日期区间下推到 SQL；两个参数都可省略，省略时与加参数之前行为一致。
  const dateFrom = url.searchParams.get("from") || undefined;
  const dateTo = url.searchParams.get("to") || undefined;
  const rows = await listCompanyLedgerEntries(req.auth!.companyId, {
    voucherId,
    businessEventId: eventId,
    dateFrom,
    dateTo
  });
  return json(res, 200, { items: rows, total: rows.length });
}

export async function listLedgerPostingBatches(req: ApiRequest, res: ServerResponse) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const voucherId = url.searchParams.get("voucherId") || undefined;
  const rows = await listCompanyLedgerPostingBatches(req.auth!.companyId, voucherId);
  return json(res, 200, { items: rows, total: rows.length });
}

interface AccountTotalsRow {
  account_code: string;
  account_name: string;
  debit: string;
  credit: string;
}

/**
 * 每科目的借贷累计 —— **聚合下推到 SQL**（V12-B6）。
 *
 * 此前 `getLedgerSummary` / `getLedgerBalances` 都是 `listCompanyLedgerEntries(companyId)`
 * 把公司全部历史分录拉进 Node，再用 Map 逐条累加。返回给前端的却只有「每科目一行」，
 * 也就是说搬运了 N 条分录只为了得到几十行——分录上万条后内存与延迟都会明显劣化。
 * 改成 `group by` 之后，传输量与内存占用都退化成科目数，与分录数无关。
 *
 * 分组键保持 `(account_code, account_name)` 不变：历史上同一编码可能配过不同名称，
 * 旧实现按 `编码:名称` 分组会各成一行，调用方（含 close-period 集成测试）依赖
 * 「同编码多行求和」的形状，改成只按编码分组会静默改变返回结构。
 *
 * 与旧实现一样**不排除结转分录**——账簿列示口径，依据见 ledger/closing-entries.ts。
 * 需要分期间的期初/本期/期末六栏时用 `/api/reports/trial-balance`，不要在这里加口径。
 */
async function queryAccountTotals(companyId: string): Promise<AccountTotalsRow[]> {
  return query<AccountTotalsRow>(
    `select account_code, account_name,
            coalesce(sum(debit), 0)::text  as debit,
            coalesce(sum(credit), 0)::text as credit
     from ledger_entries
     where company_id = $1
     group by account_code, account_name
     order by account_code asc, account_name asc`,
    [companyId]
  );
}

export async function getLedgerSummary(req: ApiRequest, res: ServerResponse) {
  const rows = await queryAccountTotals(req.auth!.companyId);
  const items = rows.map((row) => ({
    accountCode: row.account_code,
    accountName: row.account_name,
    debit: Number(row.debit).toFixed(2),
    credit: Number(row.credit).toFixed(2)
  }));
  return json(res, 200, { items, total: items.length });
}

export async function getLedgerBalances(req: ApiRequest, res: ServerResponse) {
  const rows = await queryAccountTotals(req.auth!.companyId);
  const items = rows.map((row) => {
    const debit = Number(row.debit);
    const credit = Number(row.credit);
    return {
      accountCode: row.account_code,
      accountName: row.account_name,
      debit: debit.toFixed(2),
      credit: credit.toFixed(2),
      balance: (debit - credit).toFixed(2)
    };
  });
  return json(res, 200, { items, total: items.length });
}

export async function getCashJournal(req: ApiRequest, res: ServerResponse) {
  const url = new URL(req.url || "/", "http://localhost");
  const journalType = url.searchParams.get("type") || "cash";
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  const companyId = req.auth!.companyId;

  // cash = 1001 (库存现金), bank = 1002 (银行存款)
  const prefix = journalType === "bank" ? "1002" : "1001";

  const conditions: string[] = [
    "le.company_id = $1",
    "le.account_code like $2"
  ];
  const params: unknown[] = [companyId, `${prefix}%`];
  let idx = 3;

  // 按会计日期而非过账时间筛选与排序（迁移 045 把两者分开了）。
  // 用 posted_at 的话，6 月的业务 7 月才过账就会出现在 7 月的现金日记账里，
  // 而且余额栏是按「谁先被点过账」滚动的 —— 那不是账簿的顺序。
  if (from) { conditions.push(`le.entry_date >= $${idx++}::date`); params.push(from); }
  if (to) { conditions.push(`le.entry_date <= $${idx++}::date`); params.push(to); }

  const rows = await query<{
    id: string;
    account_code: string;
    account_name: string;
    summary: string;
    debit: string;
    credit: string;
    entry_date: string;
    posted_at: string;
    voucher_id: string;
  }>(
    `select le.id, le.account_code, le.account_name, le.summary,
            le.debit::text, le.credit::text,
            le.entry_date::text as entry_date,
            le.posted_at::text,
            le.voucher_id
     from ledger_entries le
     where ${conditions.join(" and ")}
     -- 同一天内按 id 稳定排序，否则余额栏在两次查询间可能跳动
     order by le.entry_date asc, le.id asc`,
    params
  );

  let runningBalance = 0;
  const entries = rows.map((r) => {
    const debit = Number(r.debit ?? 0);
    const credit = Number(r.credit ?? 0);
    runningBalance += debit - credit;
    return {
      id: r.id,
      accountCode: r.account_code,
      accountName: r.account_name,
      summary: r.summary,
      debit: debit.toFixed(2),
      credit: credit.toFixed(2),
      balance: runningBalance.toFixed(2),
      // 日记账要显示的是会计日期（这笔账属于哪天）；过账时间一并给出，
      // 供「什么时候录进系统的」这类追溯用。
      entryDate: r.entry_date,
      postedAt: r.posted_at,
      voucherId: r.voucher_id
    };
  });

  json(res, 200, { items: entries, total: entries.length, journalType, prefix });
}

// ── 账期管理 ──────────────────────────────────────────────────────────────────

interface PeriodRow {
  id: string;
  period: string;
  is_locked: boolean;
  locked_at: string | null;
  locked_by: string | null;
  note: string | null;
  updated_at: string;
}

function rowToPeriod(r: PeriodRow) {
  return {
    id: r.id,
    period: r.period,
    isLocked: r.is_locked,
    lockedAt: r.locked_at,
    lockedBy: r.locked_by,
    note: r.note,
    updatedAt: r.updated_at
  };
}

export async function listAccountingPeriods(req: ApiRequest, res: ServerResponse): Promise<void> {
  const rows = await query<PeriodRow>(
    `select id, period, is_locked, locked_at::text, locked_by, note, updated_at::text
     from accounting_periods
     where company_id = $1
     order by period desc`,
    [req.auth!.companyId]
  );
  json(res, 200, { items: rows.map(rowToPeriod), total: rows.length });
}

export async function lockAccountingPeriod(
  req: ApiRequest,
  res: ServerResponse,
  period: string
): Promise<void> {
  const existing = await queryOne<PeriodRow>(
    `select id, period, is_locked, locked_at::text, locked_by, note, updated_at::text
     from accounting_periods where company_id = $1 and period = $2`,
    [req.auth!.companyId, period]
  );

  if (existing) {
    if (existing.is_locked) {
      json(res, 200, { ...rowToPeriod(existing), message: "期间已处于锁定状态" });
      return;
    }
    const updated = await queryOne<PeriodRow>(
      `update accounting_periods
       set is_locked = true, locked_at = now(), locked_by = $1, updated_at = now()
       where company_id = $2 and period = $3
       returning id, period, is_locked, locked_at::text, locked_by, note, updated_at::text`,
      [req.auth!.username, req.auth!.companyId, period]
    );
    json(res, 200, rowToPeriod(updated!));
  } else {
    const created = await queryOne<PeriodRow>(
      `insert into accounting_periods (company_id, period, is_locked, locked_at, locked_by)
       values ($1, $2, true, now(), $3)
       returning id, period, is_locked, locked_at::text, locked_by, note, updated_at::text`,
      [req.auth!.companyId, period, req.auth!.username]
    );
    json(res, 200, rowToPeriod(created!));
  }
}

export async function unlockAccountingPeriod(
  req: ApiRequest,
  res: ServerResponse,
  period: string
): Promise<void> {
  const existing = await queryOne<PeriodRow>(
    `select id, period, is_locked, locked_at::text, locked_by, note, updated_at::text
     from accounting_periods where company_id = $1 and period = $2`,
    [req.auth!.companyId, period]
  );

  if (!existing || !existing.is_locked) {
    json(res, 200, { period, isLocked: false, message: "期间未处于锁定状态" });
    return;
  }

  const updated = await queryOne<PeriodRow>(
    `update accounting_periods
     set is_locked = false, locked_at = null, locked_by = null, updated_at = now()
     where company_id = $1 and period = $2
     returning id, period, is_locked, locked_at::text, locked_by, note, updated_at::text`,
    [req.auth!.companyId, period]
  );
  json(res, 200, rowToPeriod(updated!));
}

export async function isPeriodLocked(companyId: string, period: string): Promise<boolean> {
  const row = await queryOne<{ is_locked: boolean }>(
    `select is_locked from accounting_periods where company_id = $1 and period = $2`,
    [companyId, period]
  );
  return row?.is_locked ?? false;
}
