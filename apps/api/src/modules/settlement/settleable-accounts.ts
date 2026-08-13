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
 * ## 资产侧与负债侧必须对称（迁移 071 修的就是这个）
 *
 * 049 定 `account_type` 时，负债侧的往来科目被单边漏掉了：资产侧把 1131 应收利息、
 * 1221 其他应收款一并归进了 `asset_receivable`，负债侧对称的 2231 应付利息、
 * 2241 其他应付款却留在泛化的 `liability_current` 里。`liability_payable` 当时只有
 * 2201 应付票据、2202 应付账款——恰好是资产侧 1121/1122 的对称项，多出来的两个没跟上。
 *
 * 后果不是理论上的：**2241 有四条真实写入路径**（差旅、采购、事项路由、凭证模板都
 * 往它上面挂员工垫付款），2203 也有（预收性质的合同收入）。这些分录一直在产生，
 * 却查不出「谁垫了多少、还欠多少」「哪笔预收还没发货」。
 *
 * ## 预收为什么单列而不并入 liability_payable
 *
 * `account_type` 是科目的会计性质标签，预收不是应付款——收了钱没发货与欠了货款没付
 * 是两种不同的义务。把它塞进 `liability_payable` 只是让核销「能用」，代价是这个标签
 * 从此说了谎，而 049 引入它的全部意义就是让业务规则有据可依。资产侧 `asset_prepayment`
 * 独立于 `asset_receivable` 也是同一个道理。
 *
 * ## 已知局限：账龄表按 direction 二分，四类合并成两张
 *
 * `direction` 只有 receivable / payable 两个值，所以预付与应收合并成一张表、预收与
 * 应付合并成另一张——这是**本次改动之前就有的现状**（预付账款早就和应收账款混在
 * 一起），不是新引入的。
 *
 * 上面那个 `label` 字段（「应收款项」「预付款项」…）目前**没有任何消费方**，
 * 它是为分组呈现预备的。要真正分开成四张表，得改账龄接口的响应形状与前端面板，
 * 属于独立的一次改动，不该夹带在「让预收能核销」里。
 */
export const SETTLEABLE_ACCOUNT_TYPES: readonly SettleableAccountType[] = [
  { accountType: "asset_receivable", openSide: "debit", label: "应收款项", direction: "receivable" },
  { accountType: "asset_prepayment", openSide: "debit", label: "预付款项", direction: "receivable" },
  { accountType: "liability_payable", openSide: "credit", label: "应付款项", direction: "payable" },
  {
    accountType: "liability_advance_receipt",
    openSide: "credit",
    label: "预收款项",
    direction: "payable"
  }
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
