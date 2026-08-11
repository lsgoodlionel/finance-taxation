/**
 * 哪些科目参与往来核销，以及每类科目的「发生方」在借还是贷（V12-C2）。
 *
 * ## 为什么按 account_type 而不是科目编码
 *
 * 049 引入 `account_type` 的目的就是让业务规则不必硬编码科目码，但它至今
 * 在代码里零使用 —— `grep asset_receivable apps/api/src` 只命中数据文件。
 * 这里是第一处真正消费它的地方：D3「科目编码国标化」把 1122 换成别的编码时，
 * 本模块一行都不用改；反过来，公司自建了一个「应收账款-关联方」明细科目，
 * 只要 account_type 标对，账龄自动把它算进去。
 *
 * ## 发生方与核销方
 *
 * 应收账款是资产，赊销时**借**记（发生），收款时**贷**记（核销）。
 * 应付账款是负债，方向完全相反。把这个方向搞反，账龄表会把收款当成新的
 * 欠款、把欠款当成核销，数字全反 —— 所以它是一张显式的表，不是散在
 * SQL 里的 `debit > 0` 判断。
 */

/** 核销方向：发生额记在哪一侧。 */
export type SettlementSide = "debit" | "credit";

export interface SettleableAccountType {
  accountType: string;
  /** 发生方（形成往来余额的一侧）。 */
  openSide: SettlementSide;
  /** 供 UI 展示的中文口径名。 */
  label: string;
  /** 应收口径还是应付口径 —— 账龄表要分两张。 */
  direction: "receivable" | "payable";
}

/**
 * 可核销的科目语义。
 *
 * 预付账款（asset_prepayment）**在列**：预付给供应商的货款同样需要逐笔跟踪
 * 「付了多久还没收到货」，账龄口径与应收一致。预收账款目前的 account_type 是
 * 泛化的 `liability_current`（049 没有为它单列），因此暂不纳入 —— 与其在这里
 * 按科目码 2203 开一个特例，不如等 account_type 补齐，否则又回到硬编码科目码。
 */
export const SETTLEABLE_ACCOUNT_TYPES: readonly SettleableAccountType[] = [
  { accountType: "asset_receivable", openSide: "debit", label: "应收款项", direction: "receivable" },
  { accountType: "asset_prepayment", openSide: "debit", label: "预付款项", direction: "receivable" },
  { accountType: "liability_payable", openSide: "credit", label: "应付款项", direction: "payable" }
];

const BY_TYPE = new Map(SETTLEABLE_ACCOUNT_TYPES.map((item) => [item.accountType, item]));

export function findSettleableAccountType(accountType: string): SettleableAccountType | undefined {
  return BY_TYPE.get(accountType);
}

export function isSettleableAccountType(accountType: string | null | undefined): boolean {
  return accountType != null && BY_TYPE.has(accountType);
}

/** 可核销的 account_type 清单，用于 SQL 的 `= any($n::text[])`。 */
export const SETTLEABLE_TYPE_CODES: readonly string[] = SETTLEABLE_ACCOUNT_TYPES.map(
  (item) => item.accountType
);

/**
 * 某条分录相对于其科目而言是「发生」还是「核销」。
 *
 * 金额为 0 的一侧不算 —— 047 的约束保证一条分录只有一侧非零。
 */
export function classifyEntrySide(
  accountType: string,
  debitCents: number,
  creditCents: number
): "open" | "settle" | "none" {
  const meta = BY_TYPE.get(accountType);
  if (!meta) return "none";
  const openAmount = meta.openSide === "debit" ? debitCents : creditCents;
  const settleAmount = meta.openSide === "debit" ? creditCents : debitCents;
  if (openAmount > 0) return "open";
  if (settleAmount > 0) return "settle";
  return "none";
}
