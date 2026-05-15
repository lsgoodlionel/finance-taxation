import type { ServerResponse } from "node:http";
import type {
  LedgerEntry,
  LedgerPostingBatch,
  Voucher,
  VoucherDraftLine,
  VoucherPostingRecord
} from "@finance-taxation/domain-model";
import type { ApiRequest } from "../../types.js";
import { query, queryOne, withTransaction } from "../../db/client.js";
import { json } from "../../utils/http.js";
import {
  buildVoucherTemplateDraft,
  listVoucherTemplates
} from "./templates.js";

interface VoucherRow {
  id: string;
  company_id: string;
  business_event_id: string;
  mapping_id: string;
  voucher_type: Voucher["voucherType"];
  summary: string;
  status: Voucher["status"];
  source: Voucher["source"];
  approved_at: string | Date | null;
  posted_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

interface VoucherLineRow {
  id: string;
  voucher_id: string;
  summary: string;
  account_code: string;
  account_name: string;
  debit: string | number;
  credit: string | number;
  sort_order: number;
}

interface VoucherPostingRecordRow {
  id: string;
  company_id: string;
  voucher_id: string;
  business_event_id: string;
  posted_by_user_id: string | null;
  posted_by_name: string;
  posted_at: string | Date;
}

interface LedgerEntryRow {
  id: string;
  company_id: string;
  voucher_id: string;
  business_event_id: string;
  entry_date: string | Date;
  summary: string;
  account_code: string;
  account_name: string;
  debit: string | number;
  credit: string | number;
  source: LedgerEntry["source"];
  posted_at: string | Date;
}

interface LedgerPostingBatchRow {
  id: string;
  company_id: string;
  voucher_id: string;
  business_event_id: string;
  posted_at: string | Date;
}

function toIsoString(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toAmountString(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "0.00";
  return typeof value === "number" ? value.toFixed(2) : String(value);
}

function mapVoucherLineRow(row: VoucherLineRow): VoucherDraftLine {
  return {
    id: row.id,
    summary: row.summary,
    accountCode: row.account_code,
    accountName: row.account_name,
    debit: toAmountString(row.debit),
    credit: toAmountString(row.credit)
  };
}

function mapVoucherRow(row: VoucherRow, lines: VoucherLineRow[]): Voucher {
  return {
    id: row.id,
    companyId: row.company_id,
    businessEventId: row.business_event_id,
    mappingId: row.mapping_id,
    voucherType: row.voucher_type,
    summary: row.summary,
    status: row.status,
    lines: lines
      .filter((line) => line.voucher_id === row.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(mapVoucherLineRow),
    approvedAt: toIsoString(row.approved_at),
    postedAt: toIsoString(row.posted_at),
    source: row.source,
    createdAt: toIsoString(row.created_at) || new Date().toISOString(),
    updatedAt: toIsoString(row.updated_at) || new Date().toISOString()
  };
}

function mapVoucherPostingRecordRow(row: VoucherPostingRecordRow): VoucherPostingRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    voucherId: row.voucher_id,
    businessEventId: row.business_event_id,
    postedByUserId: row.posted_by_user_id,
    postedByName: row.posted_by_name,
    postedAt: toIsoString(row.posted_at) || new Date().toISOString()
  };
}

function mapLedgerEntryRow(row: LedgerEntryRow): LedgerEntry {
  return {
    id: row.id,
    companyId: row.company_id,
    voucherId: row.voucher_id,
    businessEventId: row.business_event_id,
    entryDate: (toIsoString(row.entry_date) || "").slice(0, 10),
    summary: row.summary,
    accountCode: row.account_code,
    accountName: row.account_name,
    debit: toAmountString(row.debit),
    credit: toAmountString(row.credit),
    source: row.source,
    postedAt: toIsoString(row.posted_at) || new Date().toISOString()
  };
}

export async function listCompanyVouchers(
  companyId: string,
  options: { businessEventId?: string; voucherId?: string } = {}
): Promise<Voucher[]> {
  const params: unknown[] = [companyId];
  let where = "where company_id = $1";
  if (options.businessEventId) {
    params.push(options.businessEventId);
    where += ` and business_event_id = $${params.length}`;
  }
  if (options.voucherId) {
    params.push(options.voucherId);
    where += ` and id = $${params.length}`;
  }
  const voucherRows = await query<VoucherRow>(
    `
      select
        id, company_id, business_event_id, mapping_id, voucher_type, summary, status,
        source, approved_at, posted_at, created_at, updated_at
      from vouchers
      ${where}
      order by created_at desc
    `,
    params
  );
  if (!voucherRows.length) {
    return [];
  }
  const voucherIds = voucherRows.map((row) => row.id);
  const lineRows = await query<VoucherLineRow>(
    `
      select
        id, voucher_id, summary, account_code, account_name, debit, credit, sort_order
      from voucher_lines
      where voucher_id = any($1::text[])
      order by sort_order asc
    `,
    [voucherIds]
  );
  return voucherRows.map((row) => mapVoucherRow(row, lineRows));
}

export async function listCompanyVoucherPostingRecords(
  companyId: string,
  voucherId?: string
): Promise<VoucherPostingRecord[]> {
  const params: unknown[] = [companyId];
  let where = "where company_id = $1";
  if (voucherId) {
    params.push(voucherId);
    where += ` and voucher_id = $${params.length}`;
  }
  const rows = await query<VoucherPostingRecordRow>(
    `
      select
        id, company_id, voucher_id, business_event_id, posted_by_user_id, posted_by_name, posted_at
      from voucher_posting_records
      ${where}
      order by posted_at desc
    `,
    params
  );
  return rows.map(mapVoucherPostingRecordRow);
}

export async function listCompanyLedgerEntries(
  companyId: string,
  options: { voucherId?: string; businessEventId?: string } = {}
): Promise<LedgerEntry[]> {
  const params: unknown[] = [companyId];
  let where = "where company_id = $1";
  if (options.voucherId) {
    params.push(options.voucherId);
    where += ` and voucher_id = $${params.length}`;
  }
  if (options.businessEventId) {
    params.push(options.businessEventId);
    where += ` and business_event_id = $${params.length}`;
  }
  const rows = await query<LedgerEntryRow>(
    `
      select
        id, company_id, voucher_id, business_event_id, entry_date, summary,
        account_code, account_name, debit, credit, source, posted_at
      from ledger_entries
      ${where}
      order by posted_at desc, id asc
    `,
    params
  );
  return rows.map(mapLedgerEntryRow);
}

export async function listCompanyLedgerPostingBatches(
  companyId: string,
  voucherId?: string
): Promise<LedgerPostingBatch[]> {
  const params: unknown[] = [companyId];
  let where = "where b.company_id = $1";
  if (voucherId) {
    params.push(voucherId);
    where += ` and b.voucher_id = $${params.length}`;
  }
  const batchRows = await query<LedgerPostingBatchRow>(
    `
      select b.id, b.company_id, b.voucher_id, b.business_event_id, b.posted_at
      from ledger_posting_batches b
      ${where}
      order by b.posted_at desc
    `,
    params
  );
  if (!batchRows.length) {
    return [];
  }
  const batchIds = batchRows.map((row) => row.id);
  const entryLinks = await query<{ batch_id: string; entry_id: string }>(
    `
      select batch_id, entry_id
      from ledger_posting_batch_entries
      where batch_id = any($1::text[])
    `,
    [batchIds]
  );
  return batchRows.map((row) => ({
    id: row.id,
    companyId: row.company_id,
    voucherId: row.voucher_id,
    businessEventId: row.business_event_id,
    entryIds: entryLinks.filter((item) => item.batch_id === row.id).map((item) => item.entry_id),
    postedAt: toIsoString(row.posted_at) || new Date().toISOString()
  }));
}

async function getVoucherForCompany(companyId: string, voucherId: string): Promise<Voucher | null> {
  const rows = await listCompanyVouchers(companyId, { voucherId });
  return rows[0] ?? null;
}

export async function listVouchers(req: ApiRequest, res: ServerResponse) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const eventId = url.searchParams.get("businessEventId") || undefined;
  const rows = await listCompanyVouchers(req.auth!.companyId, { businessEventId: eventId });
  return json(res, 200, { items: rows, total: rows.length });
}

export async function getVoucherTemplates(_req: ApiRequest, res: ServerResponse) {
  return json(res, 200, {
    items: listVoucherTemplates().map((item) => ({
      key: item.key,
      label: item.label,
      description: item.description,
      voucherType: item.voucherType
    })),
    total: listVoucherTemplates().length
  });
}

export async function createVoucherFromTemplate(req: ApiRequest, res: ServerResponse) {
  const body = (req.body || {}) as {
    templateKey?: string;
    amount?: string;
    summary?: string;
    businessEventId?: string;
  };
  if (!body.templateKey || !body.amount || !body.businessEventId) {
    return json(res, 400, { error: "templateKey, amount and businessEventId are required" });
  }

  const event = await queryOne<{ id: string }>(
    `
      select id
      from business_events
      where id = $1 and company_id = $2
    `,
    [body.businessEventId, req.auth!.companyId]
  );
  if (!event) {
    return json(res, 404, { error: "Business event not found" });
  }

  let draft;
  try {
    draft = buildVoucherTemplateDraft({
      templateKey: body.templateKey,
      amount: body.amount,
      summary: body.summary,
      businessEventId: body.businessEventId,
      companyId: req.auth!.companyId
    });
  } catch (error) {
    return json(res, 400, { error: (error as Error).message });
  }

  const now = new Date().toISOString();
  const mappingId = `tpl-draft-${Date.now()}`;
  const voucherId = `tpl-voucher-${Date.now()}`;
  const voucher: Voucher = {
    id: voucherId,
    companyId: req.auth!.companyId,
    businessEventId: draft.businessEventId,
    mappingId,
    voucherType: draft.voucherType,
    summary: draft.summary,
    status: "draft",
    lines: draft.lines.map((line, index) => ({
      ...line,
      id: `${voucherId}-line-${index + 1}`
    })),
    approvedAt: null,
    postedAt: null,
    source: "analysis",
    createdAt: now,
    updatedAt: now
  };

  await withTransaction(async (client) => {
    await client.query(
      `
        insert into event_voucher_drafts (
          id,
          company_id,
          business_event_id,
          voucher_type,
          status,
          summary,
          created_at
        ) values ($1, $2, $3, $4, $5, $6, $7::timestamptz)
      `,
      [
        mappingId,
        voucher.companyId,
        voucher.businessEventId,
        voucher.voucherType,
        "draft",
        voucher.summary,
        now
      ]
    );

    for (const [index, line] of voucher.lines.entries()) {
      await client.query(
        `
          insert into voucher_draft_lines (
            id,
            draft_id,
            summary,
            account_code,
            account_name,
            debit,
            credit,
            sort_order
          ) values ($1, $2, $3, $4, $5, $6::numeric, $7::numeric, $8)
        `,
        [
          `${mappingId}-line-${index + 1}`,
          mappingId,
          line.summary,
          line.accountCode,
          line.accountName,
          line.debit,
          line.credit,
          index
        ]
      );
    }

    await client.query(
      `
        insert into vouchers (
          id,
          company_id,
          business_event_id,
          mapping_id,
          voucher_type,
          summary,
          status,
          source,
          approved_at,
          posted_at,
          created_at,
          updated_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz, $11::timestamptz, $12::timestamptz)
      `,
      [
        voucher.id,
        voucher.companyId,
        voucher.businessEventId,
        voucher.mappingId,
        voucher.voucherType,
        voucher.summary,
        voucher.status,
        voucher.source,
        voucher.approvedAt,
        voucher.postedAt,
        voucher.createdAt,
        voucher.updatedAt
      ]
    );

    for (const [index, line] of voucher.lines.entries()) {
      await client.query(
        `
          insert into voucher_lines (
            id,
            voucher_id,
            summary,
            account_code,
            account_name,
            debit,
            credit,
            sort_order
          ) values ($1, $2, $3, $4, $5, $6::numeric, $7::numeric, $8)
        `,
        [
          line.id,
          voucher.id,
          line.summary,
          line.accountCode,
          line.accountName,
          line.debit,
          line.credit,
          index
        ]
      );
    }
  });

  return json(res, 201, voucher);
}

export async function getVoucherDetail(req: ApiRequest, res: ServerResponse, voucherId: string) {
  const target = await getVoucherForCompany(req.auth!.companyId, voucherId);
  if (!target) {
    return json(res, 404, { error: "Voucher not found" });
  }
  const postingRecords = await listCompanyVoucherPostingRecords(req.auth!.companyId, target.id);
  return json(res, 200, {
    ...target,
    postingRecords
  });
}

export async function updateVoucher(req: ApiRequest, res: ServerResponse, voucherId: string) {
  const target = await getVoucherForCompany(req.auth!.companyId, voucherId);
  if (!target) {
    return json(res, 404, { error: "Voucher not found" });
  }
  const body = (req.body || {}) as Partial<Voucher>;
  const updatedAt = new Date().toISOString();
  await queryOne(
    `
      update vouchers
      set
        status = $1,
        summary = $2,
        updated_at = $3::timestamptz
      where id = $4 and company_id = $5
      returning id
    `,
    [
      body.status ?? target.status,
      body.summary ?? target.summary,
      updatedAt,
      voucherId,
      req.auth!.companyId
    ]
  );
  const updated = await getVoucherForCompany(req.auth!.companyId, voucherId);
  return json(res, 200, updated);
}

export async function validateVoucher(req: ApiRequest, res: ServerResponse, voucherId: string) {
  const target = await getVoucherForCompany(req.auth!.companyId, voucherId);
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
  const target = await getVoucherForCompany(req.auth!.companyId, voucherId);
  if (!target) {
    return json(res, 404, { error: "Voucher not found" });
  }
  const now = new Date().toISOString();
  await queryOne(
    `
      update vouchers
      set
        status = 'review_required',
        approved_at = $1::timestamptz,
        updated_at = $1::timestamptz
      where id = $2 and company_id = $3
      returning id
    `,
    [now, voucherId, req.auth!.companyId]
  );
  const updated = await getVoucherForCompany(req.auth!.companyId, voucherId);
  return json(res, 200, updated);
}

export async function postVoucher(req: ApiRequest, res: ServerResponse, voucherId: string) {
  const target = await getVoucherForCompany(req.auth!.companyId, voucherId);
  if (!target) {
    return json(res, 404, { error: "Voucher not found" });
  }
  if (target.postedAt) {
    const [postingRecords, ledgerEntries, ledgerPostingBatches] = await Promise.all([
      listCompanyVoucherPostingRecords(req.auth!.companyId, target.id),
      listCompanyLedgerEntries(req.auth!.companyId, { voucherId: target.id }),
      listCompanyLedgerPostingBatches(req.auth!.companyId, target.id)
    ]);
    return json(res, 200, {
      ...target,
      postingRecords,
      ledgerEntries,
      ledgerPostingBatches
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
  const postingRecord: VoucherPostingRecord = {
    id: `post-${voucherId}-${Date.now()}`,
    companyId: target.companyId,
    voucherId: target.id,
    businessEventId: target.businessEventId,
    postedByUserId: req.auth!.userId,
    postedByName: req.auth!.username,
    postedAt
  };
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

  await withTransaction(async (client) => {
    await client.query(
      `
        update vouchers
        set
          status = 'posted',
          posted_at = $1::timestamptz,
          updated_at = $1::timestamptz
        where id = $2 and company_id = $3
      `,
      [postedAt, voucherId, req.auth!.companyId]
    );

    await client.query(
      `
        delete from ledger_posting_batch_entries
        where batch_id in (
          select id from ledger_posting_batches
          where company_id = $1 and voucher_id = $2
        )
      `,
      [req.auth!.companyId, voucherId]
    );
    await client.query(
      `
        delete from ledger_posting_batches
        where company_id = $1 and voucher_id = $2
      `,
      [req.auth!.companyId, voucherId]
    );
    await client.query(
      `
        delete from ledger_entries
        where company_id = $1 and voucher_id = $2
      `,
      [req.auth!.companyId, voucherId]
    );
    await client.query(
      `
        delete from voucher_posting_records
        where company_id = $1 and voucher_id = $2
      `,
      [req.auth!.companyId, voucherId]
    );

    await client.query(
      `
        insert into voucher_posting_records (
          id,
          company_id,
          voucher_id,
          business_event_id,
          posted_by_user_id,
          posted_by_name,
          posted_at
        ) values ($1, $2, $3, $4, $5, $6, $7::timestamptz)
      `,
      [
        postingRecord.id,
        postingRecord.companyId,
        postingRecord.voucherId,
        postingRecord.businessEventId,
        postingRecord.postedByUserId,
        postingRecord.postedByName,
        postingRecord.postedAt
      ]
    );

    for (const entry of createdLedgerEntries) {
      await client.query(
        `
          insert into ledger_entries (
            id,
            company_id,
            voucher_id,
            business_event_id,
            entry_date,
            summary,
            account_code,
            account_name,
            debit,
            credit,
            source,
            posted_at
          ) values ($1, $2, $3, $4, $5::date, $6, $7, $8, $9::numeric, $10::numeric, $11, $12::timestamptz)
        `,
        [
          entry.id,
          entry.companyId,
          entry.voucherId,
          entry.businessEventId,
          entry.entryDate,
          entry.summary,
          entry.accountCode,
          entry.accountName,
          entry.debit,
          entry.credit,
          entry.source,
          entry.postedAt
        ]
      );
    }

    await client.query(
      `
        insert into ledger_posting_batches (
          id,
          company_id,
          voucher_id,
          business_event_id,
          posted_at
        ) values ($1, $2, $3, $4, $5::timestamptz)
      `,
      [
        createdBatch.id,
        createdBatch.companyId,
        createdBatch.voucherId,
        createdBatch.businessEventId,
        createdBatch.postedAt
      ]
    );

    for (const entryId of createdBatch.entryIds) {
      await client.query(
        `
          insert into ledger_posting_batch_entries (batch_id, entry_id)
          values ($1, $2)
        `,
        [createdBatch.id, entryId]
      );
    }
  });

  const updated = await getVoucherForCompany(req.auth!.companyId, voucherId);
  return json(res, 200, {
    ...updated,
    postingRecords: [postingRecord],
    ledgerEntries: createdLedgerEntries,
    ledgerPostingBatches: [createdBatch]
  });
}

export async function listVoucherPostingRecords(
  req: ApiRequest,
  res: ServerResponse,
  voucherId: string
) {
  const target = await getVoucherForCompany(req.auth!.companyId, voucherId);
  if (!target) {
    return json(res, 404, { error: "Voucher not found" });
  }
  const rows = await listCompanyVoucherPostingRecords(req.auth!.companyId, voucherId);
  return json(res, 200, { items: rows, total: rows.length });
}
