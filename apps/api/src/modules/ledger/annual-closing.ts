/**
 * 年末结转：借 3131 本年利润 / 贷 3141 利润分配（V12-B5 / 蓝图 E6）。
 *
 * ## 修的是什么
 *
 * `grep '3141'` 全仓只有两处 —— 科目定义，和现金流量表把它列为筹资活动对手科目。
 * **没有任何代码把 3131 本年利润结转到 3141 利润分配。**
 *
 * 机理：`generateClosingEntries` 每次月结都往 3131 记贷方且从不清零。6xxx 因为
 * 结转分录会自我冲平所以自洽，3131 不会。系统跑满一个自然年就会出错 ——
 * 资产负债表的「本年利润」行会显示历年累计数，且逐年递增。影响在 2027 年 1 月显现。
 *
 * ## 与 Odoo 路线的分工
 *
 * 本模块是**传统路线**：在账上生成一张真实的年结凭证，审计要看到它。
 * **Odoo 路线**（报表取数只取本财年内的分录）在 fiscal-year.ts 的
 * `fiscalYearProfitFilterSql`。两条必须并存：
 * - 只做本模块 → 用户忘了做年结，报表就静默显示历年累计数（正是当前的缺陷）；
 * - 只做 Odoo 路线 → 报表对了，但账簿上没有年结痕迹，不符合国内习惯与审计要求。
 *
 * 取数口径要能识别并排除年结凭证，见 closing-sources.ts 的 `ANNUAL_CLOSING_SOURCE`
 * 与 `EXCLUDE_SYSTEM_CLOSING_SQL`。
 */

import type { PoolClient } from "pg";
import { checkAccountsUsable } from "../accounts/account-guard.js";
import { checkPostable, insertLedgerEntries } from "../vouchers/ledger-writer.js";
import { resolveVoucherWord } from "../vouchers/voucher-number.js";
import {
  CURRENT_YEAR_PROFIT_CODE,
  RETAINED_EARNINGS_CODE
} from "./account-semantics.js";
import { ANNUAL_CLOSING_SOURCE, OPENING_BALANCE_SOURCE } from "./closing-sources.js";
import {
  ensureFiscalYear,
  fiscalYearClosingPeriod,
  fiscalYearRange,
  isValidFiscalYear,
  type FiscalYearRow
} from "./fiscal-year.js";

const EPSILON = 0.005;

export interface CloseFiscalYearInput {
  companyId: string;
  year: number;
  /** ISO 时间戳，注入以保证测试确定性。 */
  now: string;
  closedBy?: string | null;
}

export interface CloseFiscalYearSuccess {
  ok: true;
  alreadyClosed: boolean;
  year: number;
  /** 正数为盈利，负数为亏损。 */
  netProfit: number;
  /** 净利润为 0 的年度不产生凭证。 */
  voucherId: string | null;
  fiscalYear: FiscalYearRow;
}

export type CloseFiscalYearFailure =
  | {
      code: "FISCAL_YEAR_INVALID" | "PERIOD_LOCKED" | "VOUCHER_NOT_BALANCED";
      message: string;
    }
  | {
      code: "PRIOR_FISCAL_YEAR_OPEN";
      message: string;
      /** 尚未结账且有账务活动的更早年度。 */
      pendingYears: number[];
    }
  | {
      code: "PROFIT_AND_LOSS_NOT_CLOSED";
      message: string;
      /** 本年度尚有余额、未结转损益的科目。 */
      offendingCodes: string[];
    }
  | {
      code: "ACCOUNT_NOT_FOUND" | "ACCOUNT_NOT_LEAF" | "ACCOUNT_INACTIVE";
      message: string;
      offendingCodes: string[];
    };

export type CloseFiscalYearResult = CloseFiscalYearSuccess | { ok: false; failure: CloseFiscalYearFailure };

async function lookupAccountName(
  client: PoolClient,
  companyId: string,
  code: string,
  fallback: string
): Promise<string> {
  const result = await client.query<{ name: string }>(
    `select name from accounts where company_id = $1 and code = $2`,
    [companyId, code]
  );
  return result.rows[0]?.name ?? fallback;
}

/**
 * 本年度尚未结转损益的科目。
 *
 * 判定口径是**截至年末的累计余额**（含月末结转分录），与 `closePeriod` 取数一致：
 * 已结转的部分被结转分录冲平，剩下的恰好是「还没结转的发生额」。
 * 不能只看本年度区间内的分录 —— 上年遗留的未结转损益也必须在这里暴露出来。
 */
async function findUnclosedProfitAccounts(
  client: PoolClient,
  companyId: string,
  yearEnd: string
): Promise<string[]> {
  const result = await client.query<{ account_code: string; balance: string }>(
    `select le.account_code, sum(le.debit - le.credit) as balance
     from ledger_entries le
     left join accounts a on a.company_id = le.company_id and a.code = le.account_code
     where le.company_id = $1
       and le.entry_date <= $2::date
       and (a.category in ('revenue', 'expense') or (a.category is null and le.account_code like '6%'))
     group by le.account_code
     having abs(sum(le.debit - le.credit)) > $3::numeric`,
    [companyId, yearEnd, EPSILON]
  );
  return result.rows.map((row) => row.account_code).sort();
}

/**
 * 更早的、有账务活动却还没结账的年度。
 *
 * **期初建账分录不算账务活动**：建账基准日通常落在上线首月的前一天（如 2025-12-31），
 * 而 2025 年度这家公司根本不在 FT 上记账。把它算进来会逼用户先「结转」一个没有
 * 任何经营发生额的年度，纯属仪式。
 */
async function findPendingPriorYears(
  client: PoolClient,
  companyId: string,
  year: number
): Promise<number[]> {
  const result = await client.query<{ year: number }>(
    `select distinct extract(year from le.entry_date)::int as year
     from ledger_entries le
     where le.company_id = $1 and extract(year from le.entry_date)::int < $2
       and le.source is distinct from $3
       and not exists (
         select 1 from fiscal_years fy
         where fy.company_id = le.company_id
           and fy.year = extract(year from le.entry_date)::int
           and fy.status = 'closed'
       )
     order by year`,
    [companyId, year, OPENING_BALANCE_SOURCE]
  );
  return result.rows.map((row) => Number(row.year));
}

/**
 * 年末结转。必须在事务内调用（传 withTransaction 的 client）。
 *
 * 幂等：同一年度重复调用返回 `alreadyClosed: true`，不重复生成凭证。数据库侧还有
 * `uq_vouchers_annual_closing` 部分唯一索引兜底并发（与 A8 修红冲重复同一思路）。
 */
export async function closeFiscalYear(
  client: PoolClient,
  input: CloseFiscalYearInput
): Promise<CloseFiscalYearResult> {
  const { companyId, year, now } = input;

  if (!isValidFiscalYear(year)) {
    return {
      ok: false,
      failure: { code: "FISCAL_YEAR_INVALID", message: `会计年度不合法：${year}。` }
    };
  }

  const fiscalYear = await ensureFiscalYear(client, companyId, year);
  if (fiscalYear.status === "closed") {
    return {
      ok: true,
      alreadyClosed: true,
      year,
      netProfit: Number(fiscalYear.netProfit ?? 0),
      voucherId: fiscalYear.closingVoucherId,
      fiscalYear
    };
  }

  const { endDate } = fiscalYearRange(year);

  // 上年未结账时不能结本年：3131 的余额会把两年的利润混在一起，结进 3141 之后
  // 再也分不开，而「哪一年赚了多少」是分红、弥补亏损、所得税汇算的基础数据。
  const pendingYears = await findPendingPriorYears(client, companyId, year);
  if (pendingYears.length > 0) {
    return {
      ok: false,
      failure: {
        code: "PRIOR_FISCAL_YEAR_OPEN",
        pendingYears,
        message:
          `${pendingYears.join("、")} 年度尚未做年末结转，不能先结 ${year} 年度。` +
          `请按年份顺序依次结账，否则各年度的利润会在 ${RETAINED_EARNINGS_CODE} 上混成一笔。`
      }
    };
  }

  // 损益必须先结平：3131 的余额来自月末结转，6xxx 还挂着余额就说明有月份没月结，
  // 此时 3131 承载的不是全年利润。
  const unclosed = await findUnclosedProfitAccounts(client, companyId, endDate);
  if (unclosed.length > 0) {
    return {
      ok: false,
      failure: {
        code: "PROFIT_AND_LOSS_NOT_CLOSED",
        offendingCodes: unclosed,
        message:
          `截至 ${endDate} 仍有损益类科目未结转：${unclosed.join("、")}。` +
          `请先完成各月的期末结转损益，再做年末结转。`
      }
    };
  }

  // ⚠️ 这里**必须包含**历史年结分录，不要排除 annual_closing。
  //
  // 取的是 3131 截至年末的**累计**余额。往年的利润早被往年的年结分录（借 3131）
  // 冲平，所以累计余额剩下的恰好是「本年度尚未结转的利润」—— 这正是本次要转的
  // 金额。若在此排除年结分录，累计余额会退回「开业至今全部利润」，于是第二年起
  // 每次年结都把此前所有年度重复结转一遍，3141 逐年翻倍。
  //
  // 与 closePeriod 取 6xxx 余额是同一个自我修正机制，口径说明见 closing-sources.ts。
  // 余额约定 debit − credit：贷方余额（负数）是盈利。
  const profitBalance = await client.query<{ balance: string }>(
    `select coalesce(sum(debit - credit), 0) as balance
     from ledger_entries
     where company_id = $1 and account_code = $2 and entry_date <= $3::date`,
    [companyId, CURRENT_YEAR_PROFIT_CODE, endDate]
  );
  const netProfit = -Number(profitBalance.rows[0]?.balance ?? 0);

  const closingPeriod = fiscalYearClosingPeriod(year);
  const voucherId = `vch-annual-close-${companyId}-${year}`;

  // 净利润恰为 0：不生成凭证（借贷两方都是 0，写进去只是噪音），但年度照常标记
  // 为已结账 —— 「这一年结过了」是真实状态，不该因为利润是 0 就留成 open，
  // 否则下一年的 PRIOR_FISCAL_YEAR_OPEN 会永远拦着。
  if (Math.abs(netProfit) < EPSILON) {
    const updated = await markYearClosed(client, {
      companyId,
      year,
      netProfit: 0,
      voucherId: null,
      now,
      closedBy: input.closedBy ?? null
    });
    return { ok: true, alreadyClosed: false, year, netProfit: 0, voucherId: null, fiscalYear: updated };
  }

  const guard = await checkAccountsUsable(
    companyId,
    [{ accountCode: CURRENT_YEAR_PROFIT_CODE }, { accountCode: RETAINED_EARNINGS_CODE }],
    client
  );
  if (!guard.ok) {
    return {
      ok: false,
      failure: { code: guard.code, message: guard.message, offendingCodes: guard.offendingCodes }
    };
  }

  const amount = Math.abs(netProfit).toFixed(2);
  const zero = "0.00";
  // 盈利：借 3131 / 贷 3141。亏损反向 —— 3131 是借方余额，转平它要记贷方，
  // 对应 3141 记借方（未分配利润减少）。
  const isProfit = netProfit > 0;
  const lines = [
    {
      accountCode: CURRENT_YEAR_PROFIT_CODE,
      debit: isProfit ? amount : zero,
      credit: isProfit ? zero : amount
    },
    {
      accountCode: RETAINED_EARNINGS_CODE,
      debit: isProfit ? zero : amount,
      credit: isProfit ? amount : zero
    }
  ];

  const postable = await checkPostable(client, {
    companyId,
    accountingDate: endDate,
    lines
  });
  if (!postable.ok) {
    return { ok: false, failure: { code: postable.code, message: postable.message } };
  }

  const summary = `${year} 年度结转本年利润`;
  await client.query(
    `insert into vouchers (
       id, company_id, voucher_type, summary, status, source,
       accounting_date, period, voucher_word, voucher_seq,
       posted_at, created_at, updated_at
     ) values (
       $1, $2, 'closing', $3, 'posted', $4,
       $5::date, $6, $7,
       coalesce(
         (select max(v2.voucher_seq) + 1 from vouchers v2
          where v2.company_id = $2 and v2.period = $6 and v2.voucher_word = $7
            and v2.status = 'posted'),
         1
       ),
       $8::timestamptz, now(), now()
     )`,
    [
      voucherId,
      companyId,
      summary,
      ANNUAL_CLOSING_SOURCE,
      endDate,
      closingPeriod,
      resolveVoucherWord("closing"),
      now
    ]
  );

  const names = new Map([
    [
      CURRENT_YEAR_PROFIT_CODE,
      await lookupAccountName(client, companyId, CURRENT_YEAR_PROFIT_CODE, "本年利润")
    ],
    [
      RETAINED_EARNINGS_CODE,
      await lookupAccountName(client, companyId, RETAINED_EARNINGS_CODE, "利润分配")
    ]
  ]);

  await insertLedgerEntries(
    client,
    lines.map((line) => ({
      id: `led-annual-close-${companyId}-${year}-${line.accountCode}`,
      companyId,
      voucherId,
      businessEventId: null,
      entryDate: endDate,
      summary,
      accountCode: line.accountCode,
      accountName: names.get(line.accountCode)!,
      debit: line.debit,
      credit: line.credit,
      source: ANNUAL_CLOSING_SOURCE,
      postedAt: now
    }))
  );

  const updated = await markYearClosed(client, {
    companyId,
    year,
    netProfit,
    voucherId,
    now,
    closedBy: input.closedBy ?? null
  });

  return { ok: true, alreadyClosed: false, year, netProfit, voucherId, fiscalYear: updated };
}

async function markYearClosed(
  client: PoolClient,
  input: {
    companyId: string;
    year: number;
    netProfit: number;
    voucherId: string | null;
    now: string;
    closedBy: string | null;
  }
): Promise<FiscalYearRow> {
  const result = await client.query(
    `update fiscal_years
     set status = 'closed', net_profit = $3::numeric, closing_voucher_id = $4,
         closed_at = $5::timestamptz, closed_by = $6, updated_at = now()
     where company_id = $1 and year = $2
     returning id, company_id, year, start_date, end_date, status,
               closing_voucher_id, net_profit, closed_at, closed_by`,
    [
      input.companyId,
      input.year,
      input.netProfit.toFixed(2),
      input.voucherId,
      input.now,
      input.closedBy
    ]
  );
  const row = result.rows[0]!;
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    year: Number(row.year),
    startDate: String(row.start_date),
    endDate: String(row.end_date),
    status: row.status,
    closingVoucherId: row.closing_voucher_id ?? null,
    netProfit: row.net_profit ?? null,
    closedAt: row.closed_at ? new Date(row.closed_at).toISOString() : null,
    closedBy: row.closed_by ?? null
  };
}
