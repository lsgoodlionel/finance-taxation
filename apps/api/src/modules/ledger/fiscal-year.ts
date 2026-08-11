/**
 * 会计年度（V12-B5 / 蓝图 E6）。
 *
 * 中国财年恒等于自然年，所以这里的日期换算是纯字符串运算，不经 `Date` —— 经
 * `Date` 往返会在非 UTC 运行时把 `2026-01-01` 前移一天（db/date-column.ts 为同一
 * 个原因给 pg 注册了 date 解析器）。
 *
 * ## 「即使忘了做年结，报表也要对」
 *
 * 这是 Odoo 的取数路线：损益类科目不结转期初，报表取数时只取**本财年内**的分录。
 * `fiscalYearProfitFilterSql` 给出这个谓词。它与传统的年结凭证路线并行存在，
 * 各自解决不同的问题：
 * - Odoo 路线保证**报表在任何时候都对**，哪怕上年没做年结；
 * - 年结凭证路线保证**账簿符合国内习惯**，审计要在账上看到那张
 *   「借 3131 / 贷 3141」的凭证。
 * 少任何一条都不完整：只做前者账上没有年结痕迹，只做后者一旦漏做年结，
 * 资产负债表的「本年利润」行就会静默显示历年累计数。
 */

import type { PoolClient } from "pg";
import { query } from "../../db/client.js";
import { excludeSystemClosingSql } from "./closing-sources.js";

export interface FiscalYearRange {
  /** `YYYY-01-01` */
  startDate: string;
  /** `YYYY-12-31` */
  endDate: string;
}

export interface FiscalYearRow {
  id: string;
  companyId: string;
  year: number;
  startDate: string;
  endDate: string;
  status: "open" | "closed";
  closingVoucherId: string | null;
  netProfit: string | null;
  closedAt: string | null;
  closedBy: string | null;
}

const MIN_YEAR = 1980;
const MAX_YEAR = 2200;

/** 财年区间。中国财年恒等于自然年，故不需要按公司查配置。 */
export function fiscalYearRange(year: number): FiscalYearRange {
  const padded = String(year).padStart(4, "0");
  return { startDate: `${padded}-01-01`, endDate: `${padded}-12-31` };
}

/** 会计日期 `YYYY-MM-DD` 落在哪个财年。 */
export function fiscalYearOf(accountingDate: string): number {
  return Number(accountingDate.slice(0, 4));
}

/** 年结凭证所在的会计期间：年结分录记在 12 月。 */
export function fiscalYearClosingPeriod(year: number): string {
  return `${String(year).padStart(4, "0")}-12`;
}

export function isValidFiscalYear(year: number): boolean {
  return Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR;
}

/**
 * 「只取本财年内的损益分录」谓词（Odoo 路线）。
 *
 * 同时排除月末/年末结转分录 —— 它们是重复计量：月末结转与被结转的业务分录金额
 * 恰好相反，年末结转只碰 3131/3141。口径见 closing-sources.ts。
 *
 * 参数占位符由调用方给出，避免本模块猜调用方的参数序号；带 JOIN 的查询要传
 * `alias`（`accounts` 表也有 `source` 列，不限定会 ambiguous）。
 */
export function fiscalYearProfitFilterSql(
  startPlaceholder: string,
  endPlaceholder: string,
  alias?: string
): string {
  const prefix = alias ? `${alias}.` : "";
  return (
    `${prefix}entry_date >= ${startPlaceholder}::date and ` +
    `${prefix}entry_date <= ${endPlaceholder}::date and ` +
    excludeSystemClosingSql(alias)
  );
}

function mapRow(row: Record<string, unknown>): FiscalYearRow {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    year: Number(row.year),
    startDate: String(row.start_date),
    endDate: String(row.end_date),
    status: row.status as "open" | "closed",
    closingVoucherId: (row.closing_voucher_id as string | null) ?? null,
    netProfit: (row.net_profit as string | null) ?? null,
    closedAt: row.closed_at ? new Date(row.closed_at as string).toISOString() : null,
    closedBy: (row.closed_by as string | null) ?? null
  };
}

const SELECT_COLUMNS = `id, company_id, year, start_date, end_date, status,
   closing_voucher_id, net_profit, closed_at, closed_by`;

/**
 * 按需补建财年行并返回它。
 *
 * 用「按需补建」而不是像科目那样建公司时触发器铺一套：财年是无界的时间序列，
 * 建公司时不知道要铺到哪一年。补建是幂等的 upsert，不会覆盖已有的结账状态。
 */
export async function ensureFiscalYear(
  client: PoolClient,
  companyId: string,
  year: number
): Promise<FiscalYearRow> {
  if (!isValidFiscalYear(year)) {
    throw new RangeError(`会计年度超出合理范围：${year}`);
  }
  const { startDate, endDate } = fiscalYearRange(year);
  const result = await client.query(
    `insert into fiscal_years (id, company_id, year, start_date, end_date)
     values ($1, $2, $3, $4::date, $5::date)
     on conflict (company_id, year) do update set updated_at = now()
     returning ${SELECT_COLUMNS}`,
    [`${companyId}:fy${year}`, companyId, year, startDate, endDate]
  );
  return mapRow(result.rows[0]!);
}

/**
 * 列出公司的财年，并把有账务活动却还没有财年行的年份一并补出来。
 *
 * 补建放在列表路径里是刻意的：存量数据是迁移 050 一次性铺的，之后新的年份要么
 * 由年结路径补建，要么由这里补建 —— 否则用户在 2027 年 1 月打开年结页面会看到
 * 一张不含 2027 的列表，而 2027 恰恰是他要结的那一年的下一年。
 */
export async function listFiscalYears(companyId: string): Promise<FiscalYearRow[]> {
  const activity = await query<{ year: number }>(
    `select distinct extract(year from entry_date)::int as year
     from ledger_entries where company_id = $1
     union select extract(year from current_date)::int`,
    [companyId]
  );
  const years = activity
    .map((row) => Number(row.year))
    .filter((year) => isValidFiscalYear(year));
  if (years.length > 0) {
    // 年份走数组参数而不是拼进 SQL 文本：companyId 来自认证上下文，但「来源可信」
    // 不是把值拼进语句的理由 —— 下一个改这段代码的人未必知道它可信。
    await query(
      `insert into fiscal_years (id, company_id, year, start_date, end_date)
       select $1 || ':fy' || y, $1, y, make_date(y, 1, 1), make_date(y, 12, 31)
       from unnest($2::int[]) as y
       on conflict (company_id, year) do nothing`,
      [companyId, years]
    );
  }
  const rows = await query(
    `select ${SELECT_COLUMNS} from fiscal_years where company_id = $1 order by year desc`,
    [companyId]
  );
  return rows.map(mapRow);
}
