/**
 * 外币折算与期末调汇（V12-D5）。
 *
 * ## 法规依据
 *
 * 《企业会计准则第 19 号——外币折算》：
 * - 第十一条：外币**货币性项目**采用资产负债表日即期汇率折算，汇兑差额计入当期损益；
 * - 第十二条：以历史成本计量的**非货币性项目**仍按交易发生日汇率，不改变其记账
 *   本位币金额。
 *
 * 所以调汇范围只含货币性项目 —— 这是准则要求，**不是为了少写代码**。
 *
 * ## 记账本位币固定 CNY
 *
 * 多本位币要把整套报表按不同本位币重算，超出「最小版本」。本模块只解决「外币业务
 * 折算成 CNY 记账、期末按新汇率重估」这一条链路。
 *
 * ## 金额与汇率都用整数
 *
 * 金额是分，汇率是「1 外币 = N 本位币」乘以 1e6 的整数（6 位小数）。浮点汇率在
 * 逐笔折算后累积的偏差会让调汇差额里混进舍入噪音，而调汇差额直接进损益。
 */

/** 汇率的标度：1 外币 = rate / RATE_SCALE 本位币。 */
export const RATE_SCALE = 1_000_000;

/** 记账本位币。多本位币不在最小版本范围内。 */
export const BASE_CURRENCY = "CNY";

export type MonetaryCategory = "asset" | "liability";

/**
 * 外币金额折算成本位币（分）。
 *
 * 四舍五入到分：折算结果要直接进总账，留小数位会在借贷平衡校验时炸掉。
 */
export function convertToBaseCents(foreignCents: number, rate: number): number {
  return Math.round((foreignCents * rate) / RATE_SCALE);
}

export interface RevaluationInput {
  accountCode: string;
  accountName: string;
  /** 科目性质。资产与负债的调汇方向正好相反。 */
  category: MonetaryCategory;
  currency: string;
  /** 期末外币余额（外币分）。 */
  foreignBalanceCents: number;
  /** 期末本位币账面余额（分）—— 各笔业务按当时汇率折算后累积的结果。 */
  baseBookBalanceCents: number;
  /** 资产负债表日即期汇率。 */
  closingRate: number;
  /**
   * 是否货币性项目。缺省 true —— 会走到调汇的科目绝大多数是货币资金与应收应付。
   * 预付账款、存货这类以历史成本计量的非货币性项目要显式传 false。
   */
  isMonetary?: boolean;
}

export interface RevaluationResult {
  /** 本位币应有金额 − 账面金额。正数表示账面少了。 */
  differenceCents: number;
  needsAdjustment: boolean;
  /** 差额对企业是收益还是损失。资产与负债在同一个汇率变动下结论相反。 */
  isGain: boolean;
  /** 调整分录里，**本科目**记哪一方。 */
  accountSide: "debit" | "credit";
  /** 对手方（汇兑损益）记哪一方。 */
  gainLossSide: "debit" | "credit";
  /** 不需要调整时说明原因，直接用在调汇底稿上。 */
  reason: string;
}

function noAdjustment(reason: string): RevaluationResult {
  return {
    differenceCents: 0,
    needsAdjustment: false,
    isGain: false,
    accountSide: "debit",
    gainLossSide: "credit",
    reason
  };
}

/**
 * 单个货币性项目的期末调汇。
 *
 * ## 方向
 *
 * 差额 = 按期末汇率应有的本位币金额 − 账面本位币金额。
 *
 * | | 差额为正（外币升值） | 差额为负（外币贬值） |
 * |---|---|---|
 * | **资产**（银行存款、应收） | 资产增加 → 借资产 / 贷汇兑收益 | 资产减少 → 借汇兑损失 / 贷资产 |
 * | **负债**（应付） | 要还的更多 → 借汇兑损失 / 贷负债 | 要还的更少 → 借负债 / 贷汇兑收益 |
 *
 * 同一个汇率变动，资产是收益、负债是损失 —— 这一条搞反会让汇兑损益整体反号，
 * 而它直接进利润表。两个方向各有一条用例钉住。
 */
export function revalueMonetaryItem(input: RevaluationInput): RevaluationResult {
  if (input.currency === BASE_CURRENCY) {
    return noAdjustment("本位币科目不参与调汇。");
  }
  if (input.isMonetary === false) {
    return noAdjustment(
      "非货币性项目按交易发生日汇率计量，期末不调（准则 19 号第十二条）。"
    );
  }
  if (input.foreignBalanceCents === 0) {
    // 外币清零而本位币还挂着钱，是记账错误而非汇率波动。硬调会把那笔挂账金额
    // 全额转进汇兑损益，等于用汇率给一个错账打掩护。
    return noAdjustment("外币余额为 0，不调汇；本位币若仍有余额请核对账务。");
  }

  const shouldBeCents = convertToBaseCents(input.foreignBalanceCents, input.closingRate);
  const differenceCents = shouldBeCents - input.baseBookBalanceCents;

  if (differenceCents === 0) {
    return noAdjustment("按期末汇率折算与账面一致，无需调整。");
  }

  const increased = differenceCents > 0;
  const isAsset = input.category === "asset";
  // 资产增加或负债减少 → 收益；资产减少或负债增加 → 损失
  const isGain = isAsset ? increased : !increased;

  return {
    differenceCents,
    needsAdjustment: true,
    isGain,
    // 本位币金额增加就记该科目的增加方：资产增加在借、负债增加在贷
    accountSide: increased === isAsset ? "debit" : "credit",
    gainLossSide: isGain ? "credit" : "debit",
    reason: isGain ? "汇率变动产生汇兑收益。" : "汇率变动产生汇兑损失。"
  };
}
