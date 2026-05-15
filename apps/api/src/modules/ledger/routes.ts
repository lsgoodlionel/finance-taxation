import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { query } from "../../db/client.js";
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
