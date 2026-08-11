/**
 * 往来明细取数与核销写入（V12-C2）。
 */

import type { PoolClient } from "pg";
import { toCents } from "../../utils/money.js";
import type { OpenItem } from "./aging.js";
import {
  classifyEntrySide,
  findSettleableAccountType,
  SETTLEABLE_TYPE_CODES,
  type SettleableAccountType
} from "./settleable-accounts.js";

/**
 * 单次查询的明细上限。
 *
 * 往来明细是逐笔的，一家活跃公司三五年能攒出上万条。不设上限的查询在数据
 * 长起来之后会突然从 200ms 变成 20s，而那时候没人记得是这里。超出上限时
 * 由调用方看到 `truncated` 标志并收窄日期范围，而不是静默少给数据。
 */
export const OPEN_ITEM_LIMIT = 5000;

interface EntryRow {
  id: string;
  counterparty_id: string | null;
  counterparty_name: string | null;
  credit_days: number | null;
  account_code: string;
  account_name: string;
  account_type: string;
  entry_date: string | Date;
  summary: string;
  debit: string;
  credit: string;
  settled: string | null;
  used: string | null;
}

function toDateOnly(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

export interface SettlementEntry extends OpenItem {
  accountType: string;
  side: "open" | "settle";
}

export interface LoadEntriesOptions {
  /** 只取该日期（含）之前发生的分录；账龄表的基准日。 */
  asOf: string;
  /** 起始日期，用于收窄大账套的查询范围。 */
  since?: string | null;
  counterpartyId?: string | null;
}

export interface LoadEntriesResult {
  entries: SettlementEntry[];
  truncated: boolean;
}

/**
 * 取往来科目的分录，并按 account_type 判定每条是「发生」还是「核销」。
 *
 * 发生方与核销方一次取回：核销界面要在同一屏里让用户把收款和欠款配对，
 * 分两次查会让两边看到的时点不一致。
 *
 * 只取**已过账**的分录 —— ledger_entries 本身就只有过账数据，这里不必再判，
 * 但值得说明：草稿凭证不参与核销，因为它还没形成债权债务。
 */
export async function loadSettlementEntries(
  client: PoolClient,
  companyId: string,
  options: LoadEntriesOptions
): Promise<LoadEntriesResult> {
  const result = await client.query<EntryRow>(
    `select
       e.id,
       e.counterparty_id,
       cp.name as counterparty_name,
       cp.credit_days,
       e.account_code,
       e.account_name,
       a.account_type,
       e.entry_date,
       e.summary,
       e.debit::text as debit,
       e.credit::text as credit,
       s.settled::text as settled,
       u.used::text as used
     from ledger_entries e
     join accounts a on a.company_id = e.company_id and a.code = e.account_code
     left join counterparties cp on cp.id = e.counterparty_id
     left join (
       select open_entry_id, sum(amount) as settled
       from ar_ap_settlements where company_id = $1 group by open_entry_id
     ) s on s.open_entry_id = e.id
     -- 核销方的已用额度必须按 settle_entry_id 聚合。只 join 上面那一个的话，
     -- 收款分录的"已用"永远是 0，配对界面会一直把用尽的收款列出来。
     left join (
       select settle_entry_id, sum(amount) as used
       from ar_ap_settlements where company_id = $1 group by settle_entry_id
     ) u on u.settle_entry_id = e.id
     where e.company_id = $1
       and a.account_type = any($2::text[])
       and e.entry_date <= $3::date
       and ($4::date is null or e.entry_date >= $4::date)
       and ($5::text is null or e.counterparty_id = $5)
     order by e.entry_date asc, e.id asc
     limit ${OPEN_ITEM_LIMIT + 1}`,
    [
      companyId,
      [...SETTLEABLE_TYPE_CODES],
      options.asOf,
      options.since ?? null,
      options.counterpartyId ?? null
    ]
  );

  const truncated = result.rows.length > OPEN_ITEM_LIMIT;
  const rows = truncated ? result.rows.slice(0, OPEN_ITEM_LIMIT) : result.rows;

  const entries: SettlementEntry[] = [];
  for (const row of rows) {
    const debitCents = toCents(row.debit);
    const creditCents = toCents(row.credit);
    const side = classifyEntrySide(row.account_type, debitCents, creditCents);
    if (side === "none") continue;

    entries.push({
      entryId: row.id,
      counterpartyId: row.counterparty_id,
      // 无档案时给一个显式的占位名，而不是空串——空串在报表上看起来像渲染坏了
      counterpartyName: row.counterparty_name ?? "未指定往来单位",
      accountCode: row.account_code,
      accountName: row.account_name,
      accountType: row.account_type,
      entryDate: toDateOnly(row.entry_date),
      summary: row.summary,
      originalCents: debitCents + creditCents,
      // 一条分录要么是发生方要么是核销方（side 已判定），各取各的聚合口径
      settledCents: side === "open" ? toCents(row.settled) : toCents(row.used),
      creditDays: row.credit_days ?? 0,
      side
    });
  }

  return { entries, truncated };
}

/** 核销侧分录的已用额度：一笔收款可以拆开核销多笔欠款，但不能超额使用。 */
export async function settleSideUsage(
  client: PoolClient,
  companyId: string,
  entryIds: readonly string[]
): Promise<Map<string, number>> {
  if (entryIds.length === 0) return new Map();
  const result = await client.query<{ settle_entry_id: string; used: string }>(
    `select settle_entry_id, sum(amount)::text as used
     from ar_ap_settlements
     where company_id = $1 and settle_entry_id = any($2::text[])
     group by settle_entry_id`,
    [companyId, [...entryIds]]
  );
  return new Map(result.rows.map((row) => [row.settle_entry_id, toCents(row.used)]));
}

export function directionOf(accountType: string): SettleableAccountType["direction"] | null {
  return findSettleableAccountType(accountType)?.direction ?? null;
}

export interface SettlementRecord {
  id: string;
  openEntryId: string;
  settleEntryId: string;
  amount: string;
  settledOn: string;
}

export async function listSettlements(
  client: PoolClient,
  companyId: string,
  entryId: string
): Promise<SettlementRecord[]> {
  const result = await client.query<{
    id: string;
    open_entry_id: string;
    settle_entry_id: string;
    amount: string;
    settled_on: string | Date;
  }>(
    `select id, open_entry_id, settle_entry_id, amount::text, settled_on
     from ar_ap_settlements
     where company_id = $1 and (open_entry_id = $2 or settle_entry_id = $2)
     order by settled_on, id`,
    [companyId, entryId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    openEntryId: row.open_entry_id,
    settleEntryId: row.settle_entry_id,
    amount: row.amount,
    settledOn: toDateOnly(row.settled_on)
  }));
}

export async function deleteSettlement(
  client: PoolClient,
  companyId: string,
  settlementId: string
): Promise<boolean> {
  const result = await client.query(
    `delete from ar_ap_settlements where company_id = $1 and id = $2`,
    [companyId, settlementId]
  );
  return (result.rowCount ?? 0) > 0;
}
