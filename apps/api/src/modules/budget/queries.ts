/**
 * 预算的取数（V13-A2）。
 *
 * 把三个数凑齐交给 `check.ts` 判断：预算额（budgets 表）、已占用
 *（budget_encumbrances 表的 reserved 状态）、已实际发生（ledger_entries）。
 *
 * ## 实际发生额的口径与 analytics 保持一致
 *
 * 用 `sum(debit - credit)` 且排除结转损益分录，与 `analytics/routes.ts` 的
 * budgetVariance 同源。结转分录会把本期费用冲成 0，不排除的话实际发生额恒为 0、
 * 预算执行率永远 0%、永远「未超支」。
 *
 * 借方为正是**费用口径**。给收入类科目立预算会得到负数——那是配置问题，
 * 而负数会在界面上明显地显示出来，不会静默算错。
 */

import { query } from "../../db/client.js";
import { EXCLUDE_PERIOD_CLOSING_SQL } from "../ledger/closing-entries.js";
import { periodKeyToDateRange, type BudgetPeriodType } from "./period.js";
import { filterApplicableBudgets, type ExpenseCriteria } from "./applicable.js";
import type { BudgetControlPolicy } from "./check.js";

export interface BudgetRow {
  id: string;
  companyId: string;
  periodType: BudgetPeriodType;
  periodKey: string;
  costCenterId: string | null;
  accountCode: string | null;
  amountCents: number;
  controlPolicy: BudgetControlPolicy;
  note: string | null;
}

export interface BudgetUsage {
  encumberedCents: number;
  actualCents: number;
}

interface BudgetDbRow {
  id: string;
  company_id: string;
  period_type: BudgetPeriodType;
  period_key: string;
  cost_center_id: string | null;
  account_code: string | null;
  amount_cents: string;
  control_policy: BudgetControlPolicy;
  note: string | null;
}

export function mapBudgetRow(row: BudgetDbRow): BudgetRow {
  return {
    id: row.id,
    companyId: row.company_id,
    periodType: row.period_type,
    periodKey: row.period_key,
    costCenterId: row.cost_center_id,
    accountCode: row.account_code,
    // bigint 经 pg 驱动是字符串。Number 在 2^53 分（约 90 万亿元）以内精确，
    // 远超任何中小企业的预算规模。
    amountCents: Number(row.amount_cents),
    controlPolicy: row.control_policy,
    note: row.note
  };
}

const BUDGET_COLUMNS = `
  id, company_id, period_type, period_key, cost_center_id,
  account_code, amount_cents, control_policy, note
`;

export async function listBudgets(companyId: string, periodKey?: string): Promise<BudgetRow[]> {
  const rows = periodKey
    ? await query<BudgetDbRow>(
        `select ${BUDGET_COLUMNS} from budgets
          where company_id = $1 and period_key = $2
          order by period_key desc, coalesce(cost_center_id, ''), coalesce(account_code, '')`,
        [companyId, periodKey]
      )
    : await query<BudgetDbRow>(
        `select ${BUDGET_COLUMNS} from budgets
          where company_id = $1
          order by period_key desc, coalesce(cost_center_id, ''), coalesce(account_code, '')`,
        [companyId]
      );
  return rows.map(mapBudgetRow);
}

export async function getBudget(companyId: string, id: string): Promise<BudgetRow | null> {
  const rows = await query<BudgetDbRow>(
    `select ${BUDGET_COLUMNS} from budgets where company_id = $1 and id = $2`,
    [companyId, id]
  );
  return rows[0] ? mapBudgetRow(rows[0]) : null;
}

/**
 * 一条预算的已占用与已实际发生。
 *
 * ## 部门维度的取数语义
 *
 * 预算限定部门时，只取该部门的分录。**没有指定成本中心的分录不计入任何部门
 * 预算**，也不按比例摊派——这与 V12-D1 部门费用报表把它们单列为「未指定」
 * 的处理一致：照实反映，不替用户猜。
 *
 * 全公司预算（`costCenterId` 为 null）则包含所有分录，含未指定成本中心的。
 */
export async function loadBudgetUsage(budget: BudgetRow): Promise<BudgetUsage> {
  const { startDate, endDate } = periodKeyToDateRange(budget.periodType, budget.periodKey);

  // 只统计 reserved：realized 的占用已经变成账上的实际发生额，两边都算
  // 会让预算凭空少一半（check.ts 的「不重复计」用例锁的就是这条口径）。
  const encumbered = await query<{ total: string }>(
    `select coalesce(sum(amount_cents), 0) as total
       from budget_encumbrances
      where budget_id = $1 and status = 'reserved'`,
    [budget.id]
  );

  const conditions: string[] = [
    "company_id = $1",
    "entry_date >= $2",
    "entry_date <= $3",
    EXCLUDE_PERIOD_CLOSING_SQL
  ];
  const params: unknown[] = [budget.companyId, startDate, endDate];

  if (budget.accountCode !== null) {
    // 前缀匹配：预算常按「6602 管理费用」这样的一级科目立，要覆盖其下全部明细。
    params.push(`${budget.accountCode}%`);
    conditions.push(`account_code like $${params.length}`);
  }
  if (budget.costCenterId !== null) {
    params.push(budget.costCenterId);
    conditions.push(`cost_center_id = $${params.length}`);
  }

  const actual = await query<{ total: string }>(
    `select coalesce(sum(debit - credit), 0) as total
       from ledger_entries
      where ${conditions.join(" and ")}`,
    params
  );

  return {
    encumberedCents: Number(encumbered[0]?.total ?? 0),
    // 账上金额是元（numeric），预算口径是分。四舍五入到分与
    // analytics/routes.ts 的 actualCents 处理一致。
    actualCents: Math.round(Number(actual[0]?.total ?? 0) * 100)
  };
}

/**
 * 找出适用于某笔支出的**全部**预算。
 *
 * 匹配规则在 `applicable.ts`（纯函数、可脱库测试），这里只负责取数。
 * 「全部」而非「挑一条」的理由见那个模块的文件头。
 */
export async function findApplicableBudgets(
  companyId: string,
  criteria: ExpenseCriteria
): Promise<BudgetRow[]> {
  return filterApplicableBudgets(await listBudgets(companyId), criteria);
}
