import type { TaxpayerType } from "@finance-taxation/domain-model";
import type { VatAccountMap } from "./vat-accounts.js";

/**
 * 月末「结转未交增值税」的账务判定（V12-B8 / 蓝图 F4）—— 纯函数，不碰数据库。
 *
 * ## 这一步在做什么
 *
 * 「应交增值税」的各专栏（销项、进项、进项税额转出、已交税金…）月内各自累加，
 * 月末要把它们轧成一个数：本月到底应缴多少、还是多缴了、还是有留抵。轧出来的
 * 结果转到「未交增值税」，那才是资产负债表上「应交税费」里真正待缴的部分。
 *
 * 不做这一步，报表上就只有销项和进项两个孤立数字 —— 销项 1000/进项 300 与
 * 销项 700/进项 0 长得一模一样，但前者已经缴过税、后者没有。
 *
 * ## 三种轧差结果
 *
 * | 情形 | 分录 |
 * |---|---|
 * | 销项 > 进项（应缴） | 借 应交增值税（转出未交增值税） / 贷 未交增值税 |
 * | 进项 > 销项（留抵） | **不做分录** —— 留抵税额继续留在进项科目，下月接着抵 |
 * | 恰好相等 | 不产生凭证 |
 *
 * 留抵不结转是税法与会计的共同要求：留抵不是一项资产索取权，税务机关不会退给你
 * （除非另行申请留抵退税，那是单独的业务），它只是下期可以少缴。把它转进
 * 「未交增值税」的借方等于在账上凭空造出一笔应收税款。
 *
 * ## 除了三种情形之外
 *
 * 真实账套里还有两件事必须一起处理，否则上表的「销项 > 进项」判定会算错：
 *
 * - **已交税金**：当月缴纳当月的增值税。它已经减少了应交增值税的贷方余额，
 *   所以缴多了会出现「转出多交增值税」（借 未交增值税 / 贷 转出多交增值税）。
 *   忽略它就会在多缴时仍然结转出一笔应缴，账面凭空多一笔负债。
 * - **进项税额转出**：已抵扣的进项被冲回，本月应缴随之增加。
 *
 * 两者都为零时（FT 目前的常规路径就是如此），本模块的行为与上表逐字一致。
 *
 * ## 预交增值税
 *
 * 财会〔2016〕22 号：月末应将当月预缴税额自「预交增值税」转入「未交增值税」
 * （借 未交增值税 / 贷 预交增值税）。它与专栏轧差是**两笔独立且各自平衡**的
 * 分录，放在同一张结转凭证里，互不影响判定结果。
 */

/** 轧差结果。 */
export type VatSettlementOutcome =
  /** 应交未交：本期该缴税，结转到未交增值税。 */
  | "payable"
  /** 多交：当月已缴超过应缴，转出多交增值税。 */
  | "overpaid"
  /** 留抵：进项大于销项，**不结转**，留抵继续挂在进项科目。 */
  | "credit_carried"
  /** 轧平：应交增值税专栏合计为零，无需结转。 */
  | "balanced"
  /** 不适用：小规模纳税人 / 一般纳税人简易计税，没有专栏可轧。 */
  | "not_applicable";

export interface VatSettlementBasis {
  /**
   * 「应交增值税」全部专栏截至**期末**的累计净额，贷方为正、借方为负。
   *
   * 累计而非本期发生额 —— 留抵要跨月结转。见 vat-accounts.ts 的 VAT_COLUMN_ROLES。
   */
  columnNetCredit: number;
  /**
   * **本期**「已交税金」的借方发生额。
   *
   * 这一项必须是本期口径而不是累计：多缴的判定是「本月已缴 > 本月应缴」，
   * 往期的已交税金早已被往期的结转分录轧掉，再算进来会把往期的缴税当成本月多缴。
   */
  taxPaidInPeriod: number;
  /** 「预交增值税」截至期末的累计借方余额（已转出的部分自然被贷方冲减）。 */
  prepaidBalance: number;
}

export interface VatSettlementLine {
  summary: string;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
}

export interface VatSettlementPlan {
  outcome: VatSettlementOutcome;
  /** 结转到「未交增值税」的应交未交额。 */
  payableAmount: string;
  /** 转出的多交额。 */
  overpaidAmount: string;
  /** 留抵税额 —— 只报告，不做分录。 */
  creditCarriedForward: string;
  /** 由「预交增值税」转入「未交增值税」的金额。 */
  prepaidTransferred: string;
  /** 空数组表示不生成凭证。 */
  lines: VatSettlementLine[];
  /** 给会计看的一句话解释，直接可展示。 */
  reason: string;
}

/** 金额低于半分即视为零：numeric(18,2) 上不可能有正常数据落在这个区间。 */
const AMOUNT_EPSILON = 0.005;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function money(value: number): string {
  return round2(value).toFixed(2);
}

/**
 * 这家纳税人是否需要做「结转未交增值税」。
 *
 * - **小规模纳税人**：只在「应交税费」下设「应交增值税」一个明细，**不设专栏、
 *   不做进项抵扣**。销售时贷记、缴纳时借记，余额本身就是应缴税额，没有可轧的东西。
 * - **一般纳税人简易计税**：简易计税项目的计提/扣减/预缴/缴纳全在
 *   「应交税费-简易计税」核算，同样不进应交增值税的专栏。
 *
 * 其余一律按一般计税处理。**默认落到一般计税是刻意的** —— 与
 * `rules.ts:resolveTaxRuleProfile` 的分支结构保持一致，且历史数据里存在
 * `taxpayer_type = 'general'` 这类不在 TaxpayerType 联合类型内的脏值
 * （见 migrations/015），它们指的就是一般纳税人。
 */
export function resolveVatSettlementApplicability(
  taxpayerType: TaxpayerType | string
): { applicable: boolean; reason: string } {
  if (taxpayerType === "small_scale") {
    return {
      applicable: false,
      reason:
        "小规模纳税人不做进项抵扣，「应交税费-应交增值税」不设专栏，" +
        "科目余额本身即为应缴税额，无需月末结转未交增值税。"
    };
  }
  if (taxpayerType === "general_simplified") {
    return {
      applicable: false,
      reason:
        "简易计税项目在「应交税费-简易计税」单独核算，不进「应交增值税」的专栏，" +
        "无需月末结转未交增值税。"
    };
  }
  return { applicable: true, reason: "一般纳税人一般计税，需月末结转未交增值税。" };
}

function line(
  summary: string,
  account: { code: string; name: string },
  side: "debit" | "credit",
  amount: number
): VatSettlementLine {
  return {
    summary,
    accountCode: account.code,
    accountName: account.name,
    debit: side === "debit" ? money(amount) : "0.00",
    credit: side === "credit" ? money(amount) : "0.00"
  };
}

/**
 * 生成结转方案。
 *
 * 判定完全由 `columnNetCredit` 的符号驱动：
 *
 * - **贷方余额（> 0）** —— 应交未交。全额转出：
 *   借 转出未交增值税 / 贷 未交增值税。转完之后专栏合计归零。
 * - **借方余额（< 0）** —— 由留抵与多缴两部分构成，必须拆开：
 *   多缴 = min(本期已交税金, 借方余额)，只有这部分转出
 *   （借 未交增值税 / 贷 转出多交增值税）；剩下的就是留抵，原样留在专栏里。
 *   拿本期已交税金封顶是关键 —— 借方余额里属于留抵的那部分绝不能被当成多缴转走。
 * - **零** —— 不产生凭证。
 */
export function buildVatSettlementPlan(
  basis: VatSettlementBasis,
  accounts: VatAccountMap,
  periodLabel: string
): VatSettlementPlan {
  const columnNet = round2(basis.columnNetCredit);
  const taxPaid = Math.max(round2(basis.taxPaidInPeriod), 0);
  const prepaid = Math.max(round2(basis.prepaidBalance), 0);

  const lines: VatSettlementLine[] = [];
  let outcome: VatSettlementOutcome;
  let payable = 0;
  let overpaid = 0;
  let carried = 0;
  let reason: string;

  if (columnNet > AMOUNT_EPSILON) {
    payable = columnNet;
    outcome = "payable";
    reason = `本期应交增值税 ${money(payable)} 元，已结转至「未交增值税」，次月申报缴纳。`;
    lines.push(
      line(`结转未交增值税 ${periodLabel}`, accounts.transferUnpaid, "debit", payable),
      line(`结转未交增值税 ${periodLabel}`, accounts.unpaid, "credit", payable)
    );
  } else if (columnNet < -AMOUNT_EPSILON) {
    const debitBalance = -columnNet;
    overpaid = round2(Math.min(taxPaid, debitBalance));
    carried = round2(debitBalance - overpaid);
    if (overpaid > AMOUNT_EPSILON) {
      outcome = "overpaid";
      reason =
        `本期已缴增值税超出应缴 ${money(overpaid)} 元，已转出多交增值税` +
        (carried > AMOUNT_EPSILON ? `；另有留抵税额 ${money(carried)} 元结转下期继续抵扣。` : "。");
      lines.push(
        line(`结转多交增值税 ${periodLabel}`, accounts.unpaid, "debit", overpaid),
        line(`结转多交增值税 ${periodLabel}`, accounts.transferOverpaid, "credit", overpaid)
      );
    } else {
      // 留抵不结转 —— 它不是一笔应收税款，只是下期可以少缴。
      outcome = "credit_carried";
      reason = `本期进项大于销项，留抵税额 ${money(carried)} 元结转下期继续抵扣，不做结转分录。`;
    }
  } else {
    outcome = "balanced";
    reason = "本期应交增值税专栏轧差为零，无需结转。";
  }

  if (prepaid > AMOUNT_EPSILON) {
    // 与专栏轧差各自平衡、互不影响，可以并入同一张凭证。
    reason += `另有预交增值税 ${money(prepaid)} 元转入「未交增值税」。`;
    lines.push(
      line(`结转预交增值税 ${periodLabel}`, accounts.unpaid, "debit", prepaid),
      line(`结转预交增值税 ${periodLabel}`, accounts.prepaid, "credit", prepaid)
    );
  }

  return {
    outcome,
    payableAmount: money(payable),
    overpaidAmount: money(overpaid),
    creditCarriedForward: money(carried),
    prepaidTransferred: money(prepaid),
    lines,
    reason
  };
}

/** 不适用于本纳税人身份时的空方案 —— 不生成任何凭证。 */
export function buildNotApplicablePlan(reason: string): VatSettlementPlan {
  return {
    outcome: "not_applicable",
    payableAmount: "0.00",
    overpaidAmount: "0.00",
    creditCarriedForward: "0.00",
    prepaidTransferred: "0.00",
    lines: [],
    reason
  };
}
