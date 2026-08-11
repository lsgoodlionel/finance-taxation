/**
 * 成本中心的适用判定与费用归集（V12-D1）。
 *
 * ## 哪些科目该带成本中心
 *
 * 费用类与成本类。资产负债类不带 —— 银行存款不属于任何部门，硬给它安一个
 * 成本中心只会让维度表里堆满无意义的组合。
 *
 * 判据用 `category`（`expense` / `cost`）而不是逐个列举 `account_type`：
 * 前者是稳定的报表分类，后者会随业务细化不断新增，漏掉一个新 account_type
 * 就意味着那一档费用悄悄从部门报表里消失。
 *
 * **例外是所得税费用**：它是公司整体税负，不归属任何部门。摊到部门头上会让
 * 部门费用凭空多出一块它既不能控制也无法解释的数字。
 */

/** 与所得税费用对应的 account_type —— 费用类里唯一不适用成本中心的一档。 */
const COMPANY_LEVEL_ACCOUNT_TYPES = new Set(["expense_tax"]);

/** 适用成本中心的科目分类。 */
const COST_CENTER_CATEGORIES = new Set(["expense", "cost"]);

export interface AccountForCostCenter {
  code: string;
  category: string;
  accountType: string;
}

/**
 * 该科目是否适用成本中心。
 *
 * 「适用」不等于「必填」：不强制是因为强制会挡住记账，而记不上账比少一个
 * 维度严重得多。缺维度的后果由报表侧显式列示（见 {@link buildCostCenterReport}
 * 的「未指定」分组），而不是在写入端拦人。
 */
export function isCostCenterApplicable(account: AccountForCostCenter): boolean {
  if (!COST_CENTER_CATEGORIES.has(account.category)) return false;
  return !COMPANY_LEVEL_ACCOUNT_TYPES.has(account.accountType);
}

/** 一条费用分录在部门报表里的原始数据。金额单位为分。 */
export interface CostEntry {
  costCenterId: string | null;
  costCenterName: string;
  accountCode: string;
  accountName: string;
  /** 费用发生额：借方为正、贷方为负（红冲与退回走贷方）。 */
  amountCents: number;
}

export interface CostCenterAccountRow {
  accountCode: string;
  accountName: string;
  amountCents: number;
}

export interface CostCenterRow {
  costCenterId: string | null;
  costCenterName: string;
  totalCents: number;
  /** 占全部费用的比例（0–1）。总额为 0 时为 0。 */
  share: number;
  accounts: CostCenterAccountRow[];
}

export interface CostCenterReport {
  period: string;
  totalCents: number;
  /** 未指定成本中心的费用额——它是这张表最该被盯着的数字，见下。 */
  unassignedCents: number;
  rows: CostCenterRow[];
}

/**
 * 按成本中心汇总费用。
 *
 * **未指定成本中心的分录单独成一行，不丢弃也不摊派。**
 *
 * 丢弃会让各部门合计对不上费用总额，用户只会以为系统算错了；按比例摊派更糟 ——
 * 它会把一笔无人认领的费用变成每个部门都要背的数字，且看不出是摊来的。
 * 显式列出来，金额和成因都在，谁该认领由人去判断。这与账龄表的「未指定往来
 * 单位」、余额调节表的「差额不凑平」是同一个原则。
 */
export function buildCostCenterReport(
  period: string,
  entries: readonly CostEntry[]
): CostCenterReport {
  const grouped = new Map<string, CostCenterRow>();
  let totalCents = 0;
  let unassignedCents = 0;

  for (const entry of entries) {
    totalCents += entry.amountCents;
    if (entry.costCenterId === null) unassignedCents += entry.amountCents;

    const key = entry.costCenterId ?? "__unassigned__";
    const row =
      grouped.get(key) ??
      ({
        costCenterId: entry.costCenterId,
        costCenterName: entry.costCenterName,
        totalCents: 0,
        share: 0,
        accounts: []
      } satisfies CostCenterRow);

    row.totalCents += entry.amountCents;

    const account = row.accounts.find((item) => item.accountCode === entry.accountCode);
    if (account) {
      account.amountCents += entry.amountCents;
    } else {
      row.accounts.push({
        accountCode: entry.accountCode,
        accountName: entry.accountName,
        amountCents: entry.amountCents
      });
    }

    grouped.set(key, row);
  }

  const rows = [...grouped.values()].map((row) => ({
    ...row,
    // 总额为 0 时比例给 0 而不是 NaN —— NaN 会在界面上渲染成 "NaN%"
    share: totalCents === 0 ? 0 : row.totalCents / totalCents,
    accounts: row.accounts.sort((a, b) => b.amountCents - a.amountCents)
  }));

  return {
    period,
    totalCents,
    unassignedCents,
    rows: rows.sort((a, b) => b.totalCents - a.totalCents)
  };
}

/**
 * 未指定比例超过阈值时的提醒文案。
 *
 * 阈值不是「多少算错」的判断——任何未指定都值得看一眼——而是「什么时候这张表
 * 已经不足以支撑部门费用分析」的界限。一成以上没归口，按部门看费用就失去意义了。
 */
export const UNASSIGNED_ALERT_THRESHOLD = 0.1;

export function describeUnassigned(report: CostCenterReport): string | null {
  if (report.unassignedCents === 0) return null;
  const ratio = report.totalCents === 0 ? 0 : report.unassignedCents / report.totalCents;
  const amount = (report.unassignedCents / 100).toFixed(2);
  const percent = (ratio * 100).toFixed(1);

  if (ratio >= UNASSIGNED_ALERT_THRESHOLD) {
    return (
      `有 ${amount}（占 ${percent}%）的费用没有指定成本中心。` +
      `这个比例下按部门看费用已经不足以支撑分析——请在凭证上补录成本中心。`
    );
  }
  return `有 ${amount}（占 ${percent}%）的费用没有指定成本中心，已单列在「未指定」一行。`;
}
