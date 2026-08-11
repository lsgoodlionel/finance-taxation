/**
 * `accounts.account_type` 的业务语义判定（V12-B4 / B5）。
 *
 * 迁移 049 给科目加了 `account_type` 这层语义标签，正是为了让「哪些科目不结转
 * 期初」「哪个是本年利润」这类规则有据可依，而不是继续在各处硬编码 `"3131"`。
 * 本模块是这些规则的单一事实来源，纯函数、可单测。
 *
 * ## 为什么用前缀匹配而不是枚举
 *
 * `accounts.account_type` 是裸 text，没有 CHECK —— 用户自建科目（`source='custom'`）
 * 可以写进模板之外的取值。列一张封闭枚举，遇到 `expense_marketing` 这种自建类型
 * 就会落到「未知」分支被静默放行，重蹈 profit-accounts.ts 那次「6602 没列举导致
 * 费用被静默丢弃、利润虚高」的覆辙。前缀判定对整个 `income*` / `expense*` 家族
 * 一律生效，新增子类型自动被覆盖。
 */

/** 本年利润科目的 account_type。年结要把它转平，且它不结转期初。 */
export const CURRENT_YEAR_PROFIT_TYPE = "equity_unaffected";

/** 利润分配科目的 account_type，年结的对手方，也是期初未分配利润的落脚点。 */
export const RETAINED_EARNINGS_TYPE = "equity_retained";

/** 本年利润科目编码（本系统沿用《企业会计制度》编码）。 */
export const CURRENT_YEAR_PROFIT_CODE = "3131";

/** 利润分配科目编码。 */
export const RETAINED_EARNINGS_CODE = "3141";

/**
 * 是不是损益类科目（收入 / 成本 / 费用）。
 *
 * **`cost_production`（4001 生产成本 / 4101 制造费用）不在此列** —— 这一条与
 * 「4xxx 属成本类」的直觉相反，但会计上是对的：这两个科目的期末余额就是**在产品**，
 * 属存货，是资产。reports/balance-sheet-accounts.ts 已按此归类（category `cost`
 * → 资产），closing.ts 的 `classifyProfitAccount` 也已把它们排除在结转损益之外
 * （返回 `other`）。本系统不做成本结转（4001/4101 → 6001c 需要产量与在产品数据，
 * 蓝图「明确不引入清单」已排除），所以 4001 余额会一直以资产形态挂在表上。
 *
 * 若在这里把 `cost_production` 判成损益类，后果是双向的错：制造业客户录不进在产品
 * 期初余额（期初资产负债表直接不平），而年结又会把在产品当利润转进 3141。
 */
export function isProfitAndLossAccountType(accountType: string): boolean {
  return accountType.startsWith("income") || accountType.startsWith("expense");
}

/** 期初余额被禁止的原因，`null` 表示允许。 */
export type OpeningBalanceRejection = "PROFIT_AND_LOSS" | "CURRENT_YEAR_PROFIT";

/**
 * 这个科目能不能有期初余额。
 *
 * 两类禁止：
 * - **损益类**：损益是期间概念，跨期不结转。建账时只录资产负债权益，历史年度的
 *   经营成果已经沉淀在未分配利润里，再录一遍收入费用就是重复计量。
 * - **本年利润 3131**：它是月末结转损益的对手方，余额由系统在本年度内累积、
 *   年末转平到 3141。给它一个期初余额等于凭空往本年度塞一笔利润，
 *   而历史累积的未分配利润应当录在 3141。迁移 049 的注释已写明这一点。
 */
export function rejectOpeningBalance(accountType: string): OpeningBalanceRejection | null {
  if (accountType === CURRENT_YEAR_PROFIT_TYPE) return "CURRENT_YEAR_PROFIT";
  if (isProfitAndLossAccountType(accountType)) return "PROFIT_AND_LOSS";
  return null;
}

export function describeOpeningBalanceRejection(
  reason: OpeningBalanceRejection,
  codes: readonly string[]
): string {
  if (reason === "CURRENT_YEAR_PROFIT") {
    return (
      `本年利润科目不能有期初余额：${codes.join("、")}。` +
      `它的余额由月末结转损益在本年度内累积、年末转平到 ${RETAINED_EARNINGS_CODE} 利润分配。` +
      `以前年度累积的未分配利润请录在 ${RETAINED_EARNINGS_CODE}。`
    );
  }
  return (
    `损益类科目不能有期初余额：${codes.join("、")}。` +
    `损益是期间概念、跨期不结转，建账时只录资产、负债、所有者权益。` +
    `以前年度的经营成果已沉淀在 ${RETAINED_EARNINGS_CODE} 利润分配（未分配利润）里。`
  );
}
