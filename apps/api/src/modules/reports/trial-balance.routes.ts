/**
 * `GET /api/reports/trial-balance?period=YYYY-MM` —— 科目余额表 / 试算平衡表。
 *
 * 取数口径、六栏定义与告警规则见 trial-balance.ts 的文件头注释。本文件只负责
 * 「一条 SQL 把六栏算完」与 HTTP 边界。
 */

import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { query } from "../../db/client.js";
import { json } from "../../utils/http.js";
import {
  buildTrialBalance,
  resolveFiscalYearStart,
  resolvePeriodRange,
  type TrialBalanceAggregate
} from "./trial-balance.js";

const PERIOD_LABEL = /^\d{4}-(0[1-9]|1[0-2])$/;

interface TrialBalanceRow {
  account_code: string;
  account_name: string;
  category: string | null;
  is_registered: boolean;
  is_active: boolean;
  inception_opening_debit: string;
  inception_opening_credit: string;
  fiscal_opening_debit: string;
  fiscal_opening_credit: string;
  period_debit: string;
  period_credit: string;
}

/**
 * 六栏一次算完，聚合全部下推到 Postgres。
 *
 * 几个不能改的点：
 *
 * - **`full outer join`**：左边是科目表（保证启用中但本期无发生额的科目也出现在表上，
 *   这正是「科目余额表以科目表为骨架」的含义），右边是总账聚合（保证账上有余额、
 *   科目表却没登记的编码不被静默丢弃——那种情况恰恰是必须暴露的数据问题）。
 *   任一侧单独做主表都会漏掉另一侧。
 * - **不排除 `source = 'period_closing'`**：账簿列示必须包含结转分录，
 *   口径依据见 ledger/closing-entries.ts。
 * - **期初两套并存**：`inception_*` 是建库至今，`fiscal_*` 是本财年内。
 *   损益类用后者（ERPNext 的 `show_unclosed_fy_pl_balances` 口径），其余用前者；
 *   两者一起取回是为了让「上年损益未结平」的残余能被算出来并写进告警。
 * - **`where entry_date <= :end`** 把期末之后的分录挡在聚合之外，
 *   与三个 `filter (where ...)` 一起构成完整的区间下推，不会把全表拉进内存。
 */
async function fetchTrialBalanceAggregates(input: {
  companyId: string;
  startDate: string;
  endDate: string;
  fiscalYearStart: string;
}): Promise<TrialBalanceAggregate[]> {
  const rows = await query<TrialBalanceRow>(
    `
      with company_accounts as (
        select code, name, category, is_active
        from accounts
        where company_id = $1
      ),
      movements as (
        select
          account_code,
          min(account_name) as account_name,
          coalesce(sum(debit)  filter (where entry_date < $2::date), 0)  as inception_opening_debit,
          coalesce(sum(credit) filter (where entry_date < $2::date), 0)  as inception_opening_credit,
          coalesce(sum(debit)  filter (where entry_date >= $4::date and entry_date < $2::date), 0) as fiscal_opening_debit,
          coalesce(sum(credit) filter (where entry_date >= $4::date and entry_date < $2::date), 0) as fiscal_opening_credit,
          coalesce(sum(debit)  filter (where entry_date between $2::date and $3::date), 0) as period_debit,
          coalesce(sum(credit) filter (where entry_date between $2::date and $3::date), 0) as period_credit
        from ledger_entries
        where company_id = $1 and entry_date <= $3::date
        group by account_code
      )
      select
        coalesce(a.code, m.account_code)                                as account_code,
        coalesce(a.name, m.account_name, a.code, m.account_code)        as account_name,
        a.category                                                     as category,
        (a.code is not null)                                           as is_registered,
        coalesce(a.is_active, false)                                   as is_active,
        coalesce(m.inception_opening_debit, 0)::text                   as inception_opening_debit,
        coalesce(m.inception_opening_credit, 0)::text                  as inception_opening_credit,
        coalesce(m.fiscal_opening_debit, 0)::text                      as fiscal_opening_debit,
        coalesce(m.fiscal_opening_credit, 0)::text                     as fiscal_opening_credit,
        coalesce(m.period_debit, 0)::text                              as period_debit,
        coalesce(m.period_credit, 0)::text                             as period_credit
      from company_accounts a
      full outer join movements m on m.account_code = a.code
      order by 1
    `,
    [input.companyId, input.startDate, input.endDate, input.fiscalYearStart]
  );

  return rows.map((row) => ({
    accountCode: row.account_code,
    accountName: row.account_name,
    category: row.category,
    isRegistered: row.is_registered,
    isActive: row.is_active,
    inceptionOpeningDebit: row.inception_opening_debit,
    inceptionOpeningCredit: row.inception_opening_credit,
    fiscalOpeningDebit: row.fiscal_opening_debit,
    fiscalOpeningCredit: row.fiscal_opening_credit,
    periodDebit: row.period_debit,
    periodCredit: row.period_credit
  }));
}

export async function getTrialBalance(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const period = url.searchParams.get("period") || "";
  if (!PERIOD_LABEL.test(period)) {
    json(res, 400, { error: "period must look like YYYY-MM" });
    return;
  }

  const { startDate, endDate } = resolvePeriodRange(period);
  const fiscalYearStart = resolveFiscalYearStart(period);
  const accounts = await fetchTrialBalanceAggregates({
    companyId: req.auth!.companyId,
    startDate,
    endDate,
    fiscalYearStart
  });

  json(
    res,
    200,
    buildTrialBalance({ period, startDate, endDate, fiscalYearStart, accounts })
  );
}
