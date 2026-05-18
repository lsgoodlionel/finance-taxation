import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { query, queryOne } from "../../db/client.js";
import { json } from "../../utils/http.js";
import {
  listCompanyLedgerEntries,
  listCompanyLedgerPostingBatches
} from "../vouchers/routes.js";

export async function listLedgerEntries(req: ApiRequest, res: ServerResponse) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const voucherId = url.searchParams.get("voucherId") || undefined;
  const eventId = url.searchParams.get("businessEventId") || undefined;
  const rows = await listCompanyLedgerEntries(req.auth!.companyId, {
    voucherId,
    businessEventId: eventId
  });
  return json(res, 200, { items: rows, total: rows.length });
}

export async function listLedgerPostingBatches(req: ApiRequest, res: ServerResponse) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const voucherId = url.searchParams.get("voucherId") || undefined;
  const rows = await listCompanyLedgerPostingBatches(req.auth!.companyId, voucherId);
  return json(res, 200, { items: rows, total: rows.length });
}

export async function getLedgerSummary(req: ApiRequest, res: ServerResponse) {
  const rows = await listCompanyLedgerEntries(req.auth!.companyId);
  const totalsByAccount = new Map<
    string,
    { accountCode: string; accountName: string; debit: number; credit: number }
  >();
  for (const row of rows) {
    const key = `${row.accountCode}:${row.accountName}`;
    const current = totalsByAccount.get(key) || {
      accountCode: row.accountCode,
      accountName: row.accountName,
      debit: 0,
      credit: 0
    };
    current.debit += Number(row.debit || 0);
    current.credit += Number(row.credit || 0);
    totalsByAccount.set(key, current);
  }
  return json(res, 200, {
    items: Array.from(totalsByAccount.values()).map((item) => ({
      ...item,
      debit: item.debit.toFixed(2),
      credit: item.credit.toFixed(2)
    })),
    total: totalsByAccount.size
  });
}

export async function getLedgerBalances(req: ApiRequest, res: ServerResponse) {
  const rows = await listCompanyLedgerEntries(req.auth!.companyId);
  const balances = new Map<
    string,
    { accountCode: string; accountName: string; debit: number; credit: number; balance: number }
  >();
  for (const row of rows) {
    const key = `${row.accountCode}:${row.accountName}`;
    const current = balances.get(key) || {
      accountCode: row.accountCode,
      accountName: row.accountName,
      debit: 0,
      credit: 0,
      balance: 0
    };
    const debit = Number(row.debit || 0);
    const credit = Number(row.credit || 0);
    current.debit += debit;
    current.credit += credit;
    current.balance += debit - credit;
    balances.set(key, current);
  }
  return json(res, 200, {
    items: Array.from(balances.values()).map((item) => ({
      ...item,
      debit: item.debit.toFixed(2),
      credit: item.credit.toFixed(2),
      balance: item.balance.toFixed(2)
    })),
    total: balances.size
  });
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

  if (from) { conditions.push(`le.posted_at >= $${idx++}`); params.push(from); }
  if (to) { conditions.push(`le.posted_at <= $${idx++}`); params.push(to); }

  const rows = await query<{
    id: string;
    account_code: string;
    account_name: string;
    summary: string;
    debit: string;
    credit: string;
    posted_at: string;
    voucher_id: string;
  }>(
    `select le.id, le.account_code, le.account_name, le.summary,
            le.debit::text, le.credit::text,
            le.posted_at::text,
            le.voucher_id
     from ledger_entries le
     where ${conditions.join(" and ")}
     order by le.posted_at asc`,
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
