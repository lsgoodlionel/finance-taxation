import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
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
