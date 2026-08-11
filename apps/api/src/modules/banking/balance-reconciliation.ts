/**
 * 银行存款余额调节表（V12-C3）。
 *
 * ## 调节表在算什么
 *
 * 银行说有 380 万，账上说有 350 万。这 30 万不一定是错 —— 更常见的是
 * **时间差**：企业月底存进去的支票银行下月才入账，银行扣的手续费企业还没收到回单。
 * 调节表把这些时间差列清楚，两边各自调整后应当相等：
 *
 *     调节后银行余额 = 对账单余额 + 企业已收银行未收 − 企业已付银行未付
 *     调节后账面余额 = 账面余额   + 银行已收企业未收 − 银行已付企业未付
 *
 * 注意加减方向是**交叉**的：银行侧要加的是"企业记了银行还没记"的收款，
 * 因为银行迟早会补记上；账面侧要加的是"银行记了企业还没记"的收款。
 * 写成同向是这块最经典的错误，两边会同时朝错误方向偏离，差额反而变大。
 *
 * ## 差额不凑平
 *
 * 调节后仍不相等，说明还有未达账项没被识别，或者存在真实错账、资金异常。
 * 这正是对账要发现的东西 —— 自动补一笔平衡数等于把对账的唯一价值抹掉。
 * 与期初建账、资产负债表自检同一个原则：把问题显式列出来，不替用户抹平。
 */

export type ReconciliationItemType =
  /** 企业已收、银行未收（在途存款）——银行侧加 */
  | "book_only_receipt"
  /** 企业已付、银行未付（未兑付支票）——银行侧减 */
  | "book_only_payment"
  /** 银行已收、企业未收（如代收利息）——账面侧加 */
  | "bank_only_receipt"
  /** 银行已付、企业未付（如银行扣费）——账面侧减 */
  | "bank_only_payment";

export interface ReconciliationItem {
  itemType: ReconciliationItemType;
  occurredOn: string;
  /** 金额恒为正数，方向由 itemType 决定。 */
  amountCents: number;
  description: string;
  sourceId: string | null;
}

export interface BalanceReconciliationInput {
  /** 银行对账单余额（分）。外部事实，用户从对账单抄入。 */
  statementBalanceCents: number;
  /** 账面余额（分），由该账户对应科目的分录算得。 */
  bookBalanceCents: number;
  items: readonly ReconciliationItem[];
}

export interface BalanceReconciliationResult {
  statementBalanceCents: number;
  bookBalanceCents: number;
  /** 银行侧调节后余额。 */
  adjustedStatementCents: number;
  /** 账面侧调节后余额。 */
  adjustedBookCents: number;
  /** 两侧调节后之差；0 表示对平。 */
  differenceCents: number;
  balanced: boolean;
  subtotals: Record<ReconciliationItemType, number>;
  items: readonly ReconciliationItem[];
}

/**
 * 对平判定不留容差。
 *
 * 全程按整数分算，不存在浮点漂移，也就没有"差一分是舍入还是真错账"的模糊地带。
 * 留容差只会让这张表把小额差异吞掉 —— 而挪用资金往往正是从小额开始的。
 */
const BALANCED_TOLERANCE_CENTS = 0;

function emptySubtotals(): Record<ReconciliationItemType, number> {
  return {
    book_only_receipt: 0,
    book_only_payment: 0,
    bank_only_receipt: 0,
    bank_only_payment: 0
  };
}

export function buildBalanceReconciliation(
  input: BalanceReconciliationInput
): BalanceReconciliationResult {
  const subtotals = emptySubtotals();
  for (const item of input.items) {
    subtotals[item.itemType] += item.amountCents;
  }

  // 交叉方向：银行侧调的是企业已记而银行未记的，账面侧调的是银行已记而企业未记的
  const adjustedStatementCents =
    input.statementBalanceCents + subtotals.book_only_receipt - subtotals.book_only_payment;
  const adjustedBookCents =
    input.bookBalanceCents + subtotals.bank_only_receipt - subtotals.bank_only_payment;

  const differenceCents = adjustedStatementCents - adjustedBookCents;

  return {
    statementBalanceCents: input.statementBalanceCents,
    bookBalanceCents: input.bookBalanceCents,
    adjustedStatementCents,
    adjustedBookCents,
    differenceCents,
    balanced: Math.abs(differenceCents) <= BALANCED_TOLERANCE_CENTS,
    subtotals,
    items: input.items
  };
}

/**
 * 差额的可读解释。对不平的情况给出**方向与常见成因**，而不是一句"对账不平"。
 *
 * 差额是正数意味着银行侧调节后仍高于账面侧：钱在银行有、账上没记全。
 */
export function describeDifference(result: BalanceReconciliationResult): string {
  if (result.balanced) {
    return "调节后两侧余额相等，对账通过。";
  }
  const amount = (Math.abs(result.differenceCents) / 100).toFixed(2);
  const side = result.differenceCents > 0 ? "银行侧" : "账面侧";
  return (
    `调节后仍有 ${amount} 的差额（${side}偏高）。系统不会自动补平这个差额 —— ` +
    `请检查：是否还有未识别的未达账项、是否有收付款漏记或重记、` +
    `银行对账单余额是否抄录正确。`
  );
}
