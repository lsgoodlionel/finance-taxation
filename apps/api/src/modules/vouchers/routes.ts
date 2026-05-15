import type { ServerResponse } from "node:http";
import type {
  LedgerEntry,
  LedgerPostingBatch,
  Voucher,
  VoucherPostingRecord
} from "@finance-taxation/domain-model";
import type { ApiRequest } from "../../types.js";
import { readJson, writeJson } from "../../services/jsonStore.js";
import { json } from "../../utils/http.js";

const vouchersFile = new URL("../../data/vouchers.v2.json", import.meta.url);
const voucherPostingRecordsFile = new URL("../../data/voucher-posting-records.v2.json", import.meta.url);
const ledgerEntriesFile = new URL("../../data/ledger-entries.v2.json", import.meta.url);
const ledgerPostingBatchesFile = new URL(
  "../../data/ledger-posting-batches.v2.json",
  import.meta.url
);

const seedVouchers: Voucher[] = [];
const seedVoucherPostingRecords: VoucherPostingRecord[] = [];
const seedLedgerEntries: LedgerEntry[] = [];
const seedLedgerPostingBatches: LedgerPostingBatch[] = [];

export async function listVouchers(req: ApiRequest, res: ServerResponse) {
  const rows = await readJson(vouchersFile, seedVouchers);
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const eventId = url.searchParams.get("businessEventId");
  const companyRows = rows.filter((row) => row.companyId === req.auth!.companyId);
  const filtered = eventId ? companyRows.filter((item) => item.businessEventId === eventId) : companyRows;
  return json(res, 200, { items: filtered, total: filtered.length });
}

export async function getVoucherDetail(req: ApiRequest, res: ServerResponse, voucherId: string) {
  const rows = await readJson(vouchersFile, seedVouchers);
  const postingRecords = await readJson(voucherPostingRecordsFile, seedVoucherPostingRecords);
  const target = rows.find(
    (item) => item.id === voucherId && item.companyId === req.auth!.companyId
  );
  if (!target) {
    return json(res, 404, { error: "Voucher not found" });
  }
  return json(res, 200, {
    ...target,
    postingRecords: postingRecords.filter(
      (item) => item.voucherId === target.id && item.companyId === req.auth!.companyId
    )
  });
}

export async function updateVoucher(req: ApiRequest, res: ServerResponse, voucherId: string) {
  const rows = await readJson(vouchersFile, seedVouchers);
  const target = rows.find(
    (item) => item.id === voucherId && item.companyId === req.auth!.companyId
  );
  if (!target) {
    return json(res, 404, { error: "Voucher not found" });
  }
  const body = (req.body || {}) as Partial<Voucher>;
  const next = rows.map((item) => {
    if (item.id !== voucherId) return item;
    return {
      ...item,
      status: body.status ?? item.status,
      summary: body.summary ?? item.summary,
      updatedAt: new Date().toISOString()
    };
  });
  const updated = next.find((item) => item.id === voucherId)!;
  await writeJson(vouchersFile, next);
  return json(res, 200, updated);
}

export async function validateVoucher(req: ApiRequest, res: ServerResponse, voucherId: string) {
  const rows = await readJson(vouchersFile, seedVouchers);
  const target = rows.find(
    (item) => item.id === voucherId && item.companyId === req.auth!.companyId
  );
  if (!target) {
    return json(res, 404, { error: "Voucher not found" });
  }
  const debit = target.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const credit = target.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
  const issues: string[] = [];
  if (!target.lines.length) {
    issues.push("凭证分录为空");
  }
  if (Math.abs(debit - credit) > 0.0001) {
    issues.push(`借贷不平，借方 ${debit.toFixed(2)}，贷方 ${credit.toFixed(2)}`);
  }
  if (target.lines.some((line) => !line.accountCode || !line.accountName)) {
    issues.push("存在未填写完整科目的分录");
  }
  return json(res, 200, {
    id: target.id,
    valid: issues.length === 0,
    totals: {
      debit: debit.toFixed(2),
      credit: credit.toFixed(2)
    },
    issues
  });
}

export async function approveVoucher(req: ApiRequest, res: ServerResponse, voucherId: string) {
  const rows = await readJson(vouchersFile, seedVouchers);
  const target = rows.find(
    (item) => item.id === voucherId && item.companyId === req.auth!.companyId
  );
  if (!target) {
    return json(res, 404, { error: "Voucher not found" });
  }
  const next = rows.map((item) => {
    if (item.id !== voucherId) return item;
    return {
      ...item,
      status: "review_required" as const,
      approvedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  });
  const updated = next.find((item) => item.id === voucherId)!;
  await writeJson(vouchersFile, next);
  return json(res, 200, updated);
}

export async function postVoucher(req: ApiRequest, res: ServerResponse, voucherId: string) {
  const rows = await readJson(vouchersFile, seedVouchers);
  const postingRecords = await readJson(voucherPostingRecordsFile, seedVoucherPostingRecords);
  const ledgerEntries = await readJson(ledgerEntriesFile, seedLedgerEntries);
  const ledgerPostingBatches = await readJson(ledgerPostingBatchesFile, seedLedgerPostingBatches);
  const target = rows.find(
    (item) => item.id === voucherId && item.companyId === req.auth!.companyId
  );
  if (!target) {
    return json(res, 404, { error: "Voucher not found" });
  }
  if (target.postedAt) {
    return json(res, 200, {
      ...target,
      postingRecords: postingRecords.filter((item) => item.voucherId === target.id),
      ledgerEntries: ledgerEntries.filter((item) => item.voucherId === target.id),
      ledgerPostingBatches: ledgerPostingBatches.filter((item) => item.voucherId === target.id)
    });
  }
  const debit = target.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const credit = target.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
  if (Math.abs(debit - credit) > 0.0001) {
    return json(res, 400, { error: "Voucher is not balanced" });
  }
  if (!target.approvedAt) {
    return json(res, 400, { error: "Voucher must be approved before posting" });
  }
  const postedAt = new Date().toISOString();
  const next = rows.map((item) => {
    if (item.id !== voucherId) return item;
    return {
      ...item,
      status: "posted" as const,
      postedAt,
      updatedAt: postedAt
    };
  });
  const updated = next.find((item) => item.id === voucherId)!;
  await writeJson(vouchersFile, next);
  const postingRecord: VoucherPostingRecord = {
    id: `post-${voucherId}-${Date.now()}`,
    companyId: target.companyId,
    voucherId: target.id,
    businessEventId: target.businessEventId,
    postedByUserId: req.auth!.userId,
    postedByName: req.auth!.username,
    postedAt
  };
  const nextPostingRecords = [postingRecord, ...postingRecords];
  const createdLedgerEntries: LedgerEntry[] = target.lines.map((line, index) => ({
    id: `ledger-${voucherId}-${index + 1}`,
    companyId: target.companyId,
    voucherId: target.id,
    businessEventId: target.businessEventId,
    entryDate: postedAt.slice(0, 10),
    summary: line.summary || target.summary,
    accountCode: line.accountCode,
    accountName: line.accountName,
    debit: line.debit,
    credit: line.credit,
    source: "voucher_posting",
    postedAt
  }));
  const createdBatch: LedgerPostingBatch = {
    id: `ledger-batch-${voucherId}`,
    companyId: target.companyId,
    voucherId: target.id,
    businessEventId: target.businessEventId,
    entryIds: createdLedgerEntries.map((item) => item.id),
    postedAt
  };
  const nextLedgerEntries = [
    ...createdLedgerEntries,
    ...ledgerEntries.filter((item) => item.voucherId !== target.id)
  ];
  const nextLedgerPostingBatches = [
    createdBatch,
    ...ledgerPostingBatches.filter((item) => item.voucherId !== target.id)
  ];
  await writeJson(voucherPostingRecordsFile, nextPostingRecords);
  await writeJson(ledgerEntriesFile, nextLedgerEntries);
  await writeJson(ledgerPostingBatchesFile, nextLedgerPostingBatches);
  return json(res, 200, {
    ...updated,
    postingRecords: nextPostingRecords.filter((item) => item.voucherId === target.id),
    ledgerEntries: createdLedgerEntries,
    ledgerPostingBatches: [createdBatch]
  });
}

export async function listVoucherPostingRecords(
  req: ApiRequest,
  res: ServerResponse,
  voucherId: string
) {
  const rows = await readJson(vouchersFile, seedVouchers);
  const target = rows.find(
    (item) => item.id === voucherId && item.companyId === req.auth!.companyId
  );
  if (!target) {
    return json(res, 404, { error: "Voucher not found" });
  }
  const postingRecords = await readJson(voucherPostingRecordsFile, seedVoucherPostingRecords);
  const scoped = postingRecords.filter(
    (item) => item.voucherId === voucherId && item.companyId === req.auth!.companyId
  );
  return json(res, 200, { items: scoped, total: scoped.length });
}
