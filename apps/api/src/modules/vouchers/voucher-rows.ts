/**
 * 凭证与总账分录的行类型与 mapper（V15/P3 自 routes.ts 拆出）。
 *
 * 只做形状转换，外加两个「补挂关联主数据」的小工具（往来单位、成本中心）——
 * 它们跟 mapper 一起才有意义：分录上存的是 id，展示要的是名称。
 *
 * `*Row` 接口必须与 SQL 的 select 列一一对应。散在别处时，加一列忘了改 mapper，
 * 字段会静默变成 undefined——而凭证上少一个字段不会报错，只会算错。
 */
import {
  query
} from "../../db/client.js";
import {
  toDateOnly
} from "../../db/date-column.js";
import {
  isCostCenterApplicable
} from "../cost-center/cost-center.js";
import {
  SETTLEABLE_TYPE_CODES
} from "../settlement/settleable-accounts.js";
import { formatVoucherNumber, type VoucherWord } from "./voucher-number.js";
import type {
  LedgerEntry,
  Voucher,
  VoucherDraftLine,
  VoucherPostingRecord
} from "@finance-taxation/domain-model";
export interface VoucherRow {
  id: string;
  company_id: string;
  business_event_id: string;
  mapping_id: string;
  voucher_type: Voucher["voucherType"];
  summary: string;
  status: Voucher["status"];
  source: Voucher["source"];
  accounting_date: string | Date;
  voucher_word: string | null;
  voucher_seq: number | null;
  period: string | null;
  approved_at: string | Date | null;
  posted_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface VoucherLineRow {
  id: string;
  voucher_id: string;
  summary: string;
  account_code: string;
  account_name: string;
  debit: string | number;
  credit: string | number;
  sort_order: number;
  counterparty_id: string | null;
  cost_center_id: string | null;
  currency: string | null;
  original_amount: string | number | null;
  exchange_rate: string | number | null;
}

export interface VoucherPostingRecordRow {
  id: string;
  company_id: string;
  voucher_id: string;
  business_event_id: string;
  posted_by_user_id: string | null;
  posted_by_name: string;
  posted_at: string | Date;
}

export interface LedgerEntryRow {
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
  /** 来自 accounts 表的 left join；分录指向一个已不存在的科目时为 null。 */
  account_category?: LedgerEntry["accountCategory"];
}

export interface LedgerPostingBatchRow {
  id: string;
  company_id: string;
  voucher_id: string;
  business_event_id: string;
  posted_at: string | Date;
}

export function toIsoString(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function toAmountString(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "0.00";
  return typeof value === "number" ? value.toFixed(2) : String(value);
}

/**
 * 把业务事件上的往来单位贴到凭证行（V12-C2）。
 *
 * 只贴往来科目 —— 判据是 `account_type` 落在 SETTLEABLE_TYPE_CODES 里，
 * 而不是科目码前缀。**就地修改传入的行**：这些行是本函数调用方刚刚构造出来
 * 的、尚未落库的临时对象，此处改它不会影响任何别处持有的状态。
 */
export async function attachCounterparty(
  companyId: string,
  lines: { accountCode: string; counterpartyId?: string | null }[],
  counterpartyId: string | null
): Promise<void> {
  if (!counterpartyId || lines.length === 0) return;
  const codes = [...new Set(lines.map((line) => line.accountCode))];
  const rows = await query<{ code: string }>(
    `select code from accounts
     where company_id = $1 and code = any($2::text[]) and account_type = any($3::text[])`,
    [companyId, codes, [...SETTLEABLE_TYPE_CODES]]
  );
  const settleable = new Set(rows.map((row) => row.code));
  for (const line of lines) {
    if (settleable.has(line.accountCode)) {
      line.counterpartyId = counterpartyId;
    }
  }
}

/**
 * 把成本中心贴到凭证行（V12-D1 的最后一环）。
 *
 * D1 建了成本中心主数据、加了 `ledger_entries.cost_center_id`、做了部门费用报表，
 * **但没有任何地方给这一列赋值**——于是报表里所有金额都落在「未指定」一行，
 * 整张报表实际不可用。这里补上写入侧。
 *
 * 与 {@link attachCounterparty} 同构：一个值 + 按科目性质判定该贴给哪些行。
 * 判据是 `isCostCenterApplicable`（费用类，且排除所得税这类公司级科目），
 * 而不是科目码前缀。
 *
 * **只贴适用的行，不强制**：一张凭证里银行存款、应交税费那几行不属于任何部门，
 * 贴上去只会让部门费用凭空多出一笔。而适用行漏贴的后果是落进「未指定」分组，
 * 由报表显式列示——不在写入端拦人，因为记不上账比少一个维度严重得多。
 */
export async function attachCostCenter(
  companyId: string,
  lines: { accountCode: string; costCenterId?: string | null }[],
  costCenterId: string | null
): Promise<void> {
  if (!costCenterId || lines.length === 0) return;
  const codes = [...new Set(lines.map((line) => line.accountCode))];
  const rows = await query<{ code: string; category: string; account_type: string }>(
    `select code, category, account_type from accounts
     where company_id = $1 and code = any($2::text[])`,
    [companyId, codes]
  );
  const applicable = new Set(
    rows
      .filter((row) =>
        isCostCenterApplicable({
          code: row.code,
          category: row.category,
          accountType: row.account_type
        })
      )
      .map((row) => row.code)
  );
  for (const line of lines) {
    if (applicable.has(line.accountCode)) {
      line.costCenterId = costCenterId;
    }
  }
}

export function mapVoucherLineRow(row: VoucherLineRow): VoucherDraftLine {
  return {
    id: row.id,
    summary: row.summary,
    accountCode: row.account_code,
    accountName: row.account_name,
    debit: toAmountString(row.debit),
    credit: toAmountString(row.credit),
    counterpartyId: row.counterparty_id,
    costCenterId: row.cost_center_id,
    // `?? null` 不是多余的：这三列若没进 select 就是 `undefined`，而 `=== null`
    // 判不出 undefined，`Number(undefined)` 得到 NaN，进库时报
    // `invalid input syntax for type bigint: "NaN"`（初版就是这么挂的，
    // 一次挂掉 6 条凭证集成用例）。
    currency: row.currency ?? null,
    originalAmount: row.original_amount == null ? null : toAmountString(row.original_amount),
    exchangeRate: row.exchange_rate == null ? null : Number(row.exchange_rate)
  };
}

export function mapVoucherRow(row: VoucherRow, lines: VoucherLineRow[]): Voucher {
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
    accountingDate: toDateOnly(row.accounting_date) ?? "",
    // 三者齐备才成号：草稿没有 voucher_seq，此时如实给 null 而不是拼一个假号出来
    voucherNumber:
      row.voucher_word && row.period && row.voucher_seq !== null
        ? formatVoucherNumber(row.voucher_word as VoucherWord, row.period, row.voucher_seq)
        : null,
    approvedAt: toIsoString(row.approved_at),
    postedAt: toIsoString(row.posted_at),
    source: row.source,
    createdAt: toIsoString(row.created_at) || new Date().toISOString(),
    updatedAt: toIsoString(row.updated_at) || new Date().toISOString()
  };
}

export function mapVoucherPostingRecordRow(row: VoucherPostingRecordRow): VoucherPostingRecord {
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

export function mapLedgerEntryRow(row: LedgerEntryRow): LedgerEntry {
  return {
    id: row.id,
    companyId: row.company_id,
    voucherId: row.voucher_id,
    businessEventId: row.business_event_id,
    // entry_date 是 PG `date`（无时区的日历日期），必须走 toDateOnly 而不是
    // ISO 时间戳往返——后者在 UTC+ 时区会把每月 1 号前移到上一期。
    entryDate: toDateOnly(row.entry_date) ?? "",
    summary: row.summary,
    accountCode: row.account_code,
    accountName: row.account_name,
    debit: toAmountString(row.debit),
    credit: toAmountString(row.credit),
    source: row.source,
    postedAt: toIsoString(row.posted_at) || new Date().toISOString(),
    accountCategory: row.account_category ?? null
  };
}
