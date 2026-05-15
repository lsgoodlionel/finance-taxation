import type { ServerResponse } from "node:http";
import type { LedgerEntry, LedgerPostingBatch } from "@finance-taxation/domain-model";
import type { ApiRequest } from "../../types.js";
import { readJson } from "../../services/jsonStore.js";
import { json } from "../../utils/http.js";

const ledgerEntriesFile = new URL("../../data/ledger-entries.v2.json", import.meta.url);
const ledgerPostingBatchesFile = new URL(
  "../../data/ledger-posting-batches.v2.json",
  import.meta.url
);

const seedLedgerEntries: LedgerEntry[] = [];
const seedLedgerPostingBatches: LedgerPostingBatch[] = [];

export async function listLedgerEntries(req: ApiRequest, res: ServerResponse) {
  const rows = await readJson(ledgerEntriesFile, seedLedgerEntries);
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const voucherId = url.searchParams.get("voucherId");
  const eventId = url.searchParams.get("businessEventId");
  let filtered = rows.filter((row) => row.companyId === req.auth!.companyId);
  if (voucherId) {
    filtered = filtered.filter((row) => row.voucherId === voucherId);
  }
  if (eventId) {
    filtered = filtered.filter((row) => row.businessEventId === eventId);
  }
  return json(res, 200, { items: filtered, total: filtered.length });
}

export async function listLedgerPostingBatches(req: ApiRequest, res: ServerResponse) {
  const rows = await readJson(ledgerPostingBatchesFile, seedLedgerPostingBatches);
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const voucherId = url.searchParams.get("voucherId");
  let filtered = rows.filter((row) => row.companyId === req.auth!.companyId);
  if (voucherId) {
    filtered = filtered.filter((row) => row.voucherId === voucherId);
  }
  return json(res, 200, { items: filtered, total: filtered.length });
}

export async function getLedgerSummary(req: ApiRequest, res: ServerResponse) {
  const rows = await readJson(ledgerEntriesFile, seedLedgerEntries);
  const companyRows = rows.filter((row) => row.companyId === req.auth!.companyId);
  const totalsByAccount = new Map<
    string,
    { accountCode: string; accountName: string; debit: number; credit: number }
  >();
  for (const row of companyRows) {
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
  const rows = await readJson(ledgerEntriesFile, seedLedgerEntries);
  const companyRows = rows.filter((row) => row.companyId === req.auth!.companyId);
  const balances = new Map<
    string,
    { accountCode: string; accountName: string; debit: number; credit: number; balance: number }
  >();
  for (const row of companyRows) {
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
