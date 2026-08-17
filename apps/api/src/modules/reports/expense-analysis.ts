/**
 * 费用分析（V13-D6）。
 *
 * 三个维度：**按部门**、**按费用类型**、**按人员**。
 *
 * ## 数据源是报销单而不是总账
 *
 * 总账上只有科目与成本中心，没有「费用类型」与「谁报的」——那两个维度只存在
 * 于报销单上。所以这张报表读报销单，而不是像其他财务报表那样读 ledger_entries。
 *
 * 代价是：**不经报销的费用（会计直接做的凭证）不在这张表里**。这不是缺陷，
 * 是口径——它回答的是「员工报销花了多少」，不是「公司费用总额多少」。
 * 后者去看利润表。这一点必须在界面上说明白，否则两张表对不上时没人知道为什么。
 *
 * ## 只统计已批准及之后的单据
 *
 * 草稿与审批中的不算：那些钱还没批下来，算进去会让部门看到一个虚高的数字，
 * 而据此做的决策是错的。
 */

import { query } from "../../db/client.js";

export interface ExpenseAnalysisRow {
  key: string;
  label: string;
  amountCents: number;
  count: number;
}

export interface ExpenseAnalysis {
  period: string;
  byCostCenter: ExpenseAnalysisRow[];
  byExpenseType: ExpenseAnalysisRow[];
  byApplicant: ExpenseAnalysisRow[];
  totalCents: number;
}

/** 已批准及之后的状态——草稿与审批中的钱还没批下来。 */
const COUNTED_STATUSES = ["approved", "paid"];

const EXPENSE_TYPE_LABELS: Record<string, string> = {
  travel_hotel: "差旅-住宿",
  travel_meal: "差旅-餐补",
  travel_transport: "差旅-交通",
  entertainment: "业务招待",
  office: "办公用品",
  communication: "通讯",
  training: "培训",
  other: "其他"
};

export async function buildExpenseAnalysis(
  companyId: string,
  period: string
): Promise<ExpenseAnalysis> {
  const from = `${period}-01`;
  // 月末用「下月一号之前」而不是算月末日：省掉闰年与月份天数的判断，
  // 而 date 比较用半开区间在 SQL 里是标准做法。
  const toExclusive = nextMonthFirstDay(period);

  // 按成本中心：从分摊表取。**没有分摊的行归「未指定」**——与 V12-D1
  // 部门费用报表一致：不丢弃也不摊派。
  const byCostCenter = await query<{ key: string; label: string; amount: string; count: string }>(
    `select coalesce(a.cost_center_id, '__unassigned__') as key,
            coalesce(cc.name, '未指定部门') as label,
            sum(coalesce(a.amount_cents, l.amount_cents)) as amount,
            count(distinct r.id) as count
       from reimbursements r
       join reimbursement_lines l on l.reimbursement_id = r.id
       left join reimbursement_allocations a on a.line_id = l.id
       left join cost_centers cc on cc.id = a.cost_center_id
      where r.company_id = $1
        and r.status = any($2::text[])
        and r.expense_date >= $3 and r.expense_date < $4
      group by key, label
      order by amount desc`,
    [companyId, COUNTED_STATUSES, from, toExclusive]
  );

  const byExpenseType = await query<{ key: string; amount: string; count: string }>(
    `select l.expense_type as key, sum(l.amount_cents) as amount, count(*) as count
       from reimbursements r
       join reimbursement_lines l on l.reimbursement_id = r.id
      where r.company_id = $1
        and r.status = any($2::text[])
        and r.expense_date >= $3 and r.expense_date < $4
      group by l.expense_type
      order by amount desc`,
    [companyId, COUNTED_STATUSES, from, toExclusive]
  );

  const byApplicant = await query<{ key: string; label: string; amount: string; count: string }>(
    `select r.applicant_user_id as key, u.display_name as label,
            sum(l.amount_cents) as amount, count(distinct r.id) as count
       from reimbursements r
       join reimbursement_lines l on l.reimbursement_id = r.id
       join users u on u.id = r.applicant_user_id
      where r.company_id = $1
        and r.status = any($2::text[])
        and r.expense_date >= $3 and r.expense_date < $4
      group by r.applicant_user_id, u.display_name
      order by amount desc`,
    [companyId, COUNTED_STATUSES, from, toExclusive]
  );

  // 合计取「按费用类型」那一组：它是逐行求和，不受分摊左连接的影响。
  //
  // 按成本中心那一组**不能用来求合计**——一行分给两个部门会在左连接后
  // 变成两行，各自带自己的分摊额，合起来才等于行金额。用它求和是对的，
  // 但如果某行既无分摊又被别的条件放大就会重复计。用最简单那一组最稳。
  const totalCents = byExpenseType.reduce((sum, row) => sum + Number(row.amount), 0);

  return {
    period,
    byCostCenter: byCostCenter.map((row) => ({
      key: row.key,
      label: row.label,
      amountCents: Number(row.amount),
      count: Number(row.count)
    })),
    byExpenseType: byExpenseType.map((row) => ({
      key: row.key,
      label: EXPENSE_TYPE_LABELS[row.key] ?? row.key,
      amountCents: Number(row.amount),
      count: Number(row.count)
    })),
    byApplicant: byApplicant.map((row) => ({
      key: row.key,
      label: row.label,
      amountCents: Number(row.amount),
      count: Number(row.count)
    })),
    totalCents
  };
}

/** `2026-12` → `2027-01-01`。跨年要进位，这是最容易漏的一处。 */
export function nextMonthFirstDay(period: string): string {
  const [yearStr, monthStr] = period.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  return month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, "0")}-01`;
}
