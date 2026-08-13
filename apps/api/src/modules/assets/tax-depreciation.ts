/**
 * 税法口径折旧与税会差异（V12-D4）。
 *
 * ## 会计折旧不等于税前可扣除的折旧
 *
 * C1 做的是**会计折旧**：按企业自己估计的使用年限、直线法计提，进利润表。
 * 但所得税汇算要的是**税法口径**，两者规则不同，差额要做纳税调整。
 *
 * 三条差异来源，缺一条汇算就填不对：
 *
 * 1. **税法最低折旧年限**（企业所得税法实施条例第六十条）。企业把设备按 3 年
 *    折完，税法要求机器设备至少 10 年——多提的部分当年不得税前扣除，要调增。
 * 2. **一次性扣除**（财税〔2018〕54 号，经多次延续至 2027-12-31）。单位价值
 *    不超过 500 万元的设备器具可当期一次扣除，会计上仍按年限分期计提——
 *    购置当年大幅调减，以后年度逐年调增。
 * 3. **加速折旧**（双倍余额递减、年数总和法）。本模块暂不实现，见文末。
 *
 * ## 差异是「时间性」的，总额终归相等
 *
 * 无论哪种差异，一项资产在整个生命周期里税前扣除的总额都等于「原值 − 残值」，
 * 差的只是**在哪一年扣**。这是判断实现对不对的关键不变式，有用例专门守它：
 * 累计调整额必然归零。任何让它不归零的实现都是错的——那意味着凭空多扣或少扣。
 */

/**
 * 税法规定的最低折旧年限（企业所得税法实施条例第六十条）。
 *
 * 键是资产类别（`fixed_assets.category`）。未列出的类别按「器具工具家具」
 * 的 5 年处理 —— 这是实施条例里覆盖面最广的一档，比不做限制安全：
 * 不做限制等于默认企业的会计年限总是合规，那正是要检查的事。
 */
export const TAX_MINIMUM_LIFE_YEARS: Readonly<Record<string, number>> = {
  /** 房屋、建筑物 */
  building: 20,
  /** 飞机、火车、轮船、机器、机械和其他生产设备 */
  machinery: 10,
  equipment: 10,
  /** 与生产经营活动有关的器具、工具、家具等 */
  tools: 5,
  furniture: 5,
  /** 飞机、火车、轮船以外的运输工具 */
  vehicle: 4,
  /** 电子设备 */
  electronic: 3
};

/** 未登记类别的兜底年限，见 TAX_MINIMUM_LIFE_YEARS 的注释。 */
export const DEFAULT_MINIMUM_LIFE_YEARS = 5;

export function taxMinimumLifeMonths(category: string): number {
  return (TAX_MINIMUM_LIFE_YEARS[category] ?? DEFAULT_MINIMUM_LIFE_YEARS) * 12;
}

/**
 * 一次性扣除的单位价值上限（分）：500 万元。
 *
 * 财税〔2018〕54 号设定，财政部 税务总局公告 2023 年第 37 号延续至 2027-12-31。
 * 「单位价值」指单项资产的原值，不是一批设备的合计。
 */
export const ONE_TIME_DEDUCTION_LIMIT_CENTS = 500_0000_00;

/** 一次性扣除政策的有效区间。到期后购置的资产回到分期折旧。 */
export const ONE_TIME_DEDUCTION_FROM = "2018-01-01";
export const ONE_TIME_DEDUCTION_TO = "2027-12-31";

/**
 * 房屋建筑物**不适用**一次性扣除 —— 政策原文限于「设备、器具」，
 * 即除房屋、建筑物以外的固定资产。
 */
const ONE_TIME_DEDUCTION_EXCLUDED_CATEGORIES = new Set(["building"]);

export function isOneTimeDeductionEligible(input: {
  category: string;
  originalCostCents: number;
  acquiredOn: string;
}): boolean {
  if (ONE_TIME_DEDUCTION_EXCLUDED_CATEGORIES.has(input.category)) return false;
  if (input.originalCostCents > ONE_TIME_DEDUCTION_LIMIT_CENTS) return false;
  return input.acquiredOn >= ONE_TIME_DEDUCTION_FROM && input.acquiredOn <= ONE_TIME_DEDUCTION_TO;
}

export interface TaxDepreciationAsset {
  category: string;
  originalCostCents: number;
  salvageValueCents: number;
  /** 会计上估计的使用月数。 */
  accountingLifeMonths: number;
  acquiredOn: string;
  /** 是否选择一次性扣除。**企业可以放弃**，所以这是一个选择而非自动判定。 */
  electsOneTimeDeduction: boolean;
}

export interface TaxLifeResolution {
  taxLifeMonths: number;
  /** 会计年限是否短于税法最低年限——短于就意味着每年都要调增。 */
  shorterThanMinimum: boolean;
  minimumMonths: number;
}

/**
 * 税法口径的折旧年限：不得短于法定最低年限。
 *
 * 会计年限**长于**税法最低年限时按会计年限算，不强行拉短 —— 税法定的是下限
 * 不是上限，企业估计得更保守（折得更慢）是允许的，不构成差异。
 */
export function resolveTaxLife(asset: TaxDepreciationAsset): TaxLifeResolution {
  const minimumMonths = taxMinimumLifeMonths(asset.category);
  return {
    taxLifeMonths: Math.max(asset.accountingLifeMonths, minimumMonths),
    shorterThanMinimum: asset.accountingLifeMonths < minimumMonths,
    minimumMonths
  };
}

export interface TaxDepreciationInput {
  asset: TaxDepreciationAsset;
  /** 该年度内的会计折旧额（分），由 C1 的折旧明细汇总得出。 */
  accountingDepreciationCents: number;
  /** 纳税年度，如 2026。 */
  taxYear: number;
  /** 该资产截至上年末的税法口径累计扣除额（分）。 */
  priorTaxDeductionCents: number;
}

export interface TaxDepreciationResult {
  /** 本年度税法口径可扣除额（分）。 */
  taxDeductionCents: number;
  /** 本年度会计折旧额（分），原样带出便于对照。 */
  accountingDepreciationCents: number;
  /**
   * 纳税调整额 = 会计折旧 − 税法扣除。
   *
   * **正数调增**（会计多提，税前不让扣这么多）；**负数调减**（税法多扣）。
   * 方向按所得税年度纳税申报表 A105080《资产折旧、摊销及纳税调整明细表》的口径。
   */
  adjustmentCents: number;
  reason: TaxDepreciationReason;
}

export type TaxDepreciationReason =
  /** 一次性扣除：购置当年全额扣除。 */
  | "one_time_deduction"
  /** 一次性扣除的以后年度：税法已扣完，会计仍在提，逐年调增。 */
  | "one_time_deducted_prior_year"
  /** 会计年限短于税法最低年限，按税法年限摊。 */
  | "tax_minimum_life"
  /** 两者一致，无差异。 */
  | "aligned";

/** 可折旧总额 = 原值 − 预计净残值，负数按 0。 */
function depreciableBaseCents(asset: TaxDepreciationAsset): number {
  return Math.max(0, asset.originalCostCents - asset.salvageValueCents);
}

/**
 * 某纳税年度的税法扣除额与纳税调整额。
 *
 * ## 一次性扣除的残值问题
 *
 * 一次性扣除的是**原值全额**，不扣减预计净残值 —— 政策原文是「一次性计入当期
 * 成本费用」，而残值是会计上的估计，税法不认。这会让整个生命周期的税前扣除
 * 总额（原值）大于会计折旧总额（原值 − 残值），差的正是残值那部分。
 *
 * 因此累计调整额归零的不变式，只在残值为 0 时严格成立；有残值时会差一个残值
 * 的金额，那是**真实的永久性差异**（会计计了残值、税法没有），不是实现错误。
 * 用例对两种情形分别断言。
 */
export function taxDepreciationForYear(input: TaxDepreciationInput): TaxDepreciationResult {
  const { asset, accountingDepreciationCents, taxYear } = input;
  const acquiredYear = Number(asset.acquiredOn.slice(0, 4));

  if (asset.electsOneTimeDeduction && isOneTimeDeductionEligible(asset)) {
    if (taxYear === acquiredYear) {
      // 购置当年全额扣除。会计当年只提了几个月（当月增加当月不提），
      // 所以这一年通常是大额调减。
      const taxDeductionCents = asset.originalCostCents;
      return {
        taxDeductionCents,
        accountingDepreciationCents,
        adjustmentCents: accountingDepreciationCents - taxDeductionCents,
        reason: "one_time_deduction"
      };
    }
    if (taxYear > acquiredYear) {
      // 税法已经扣完，以后年度税前扣除为 0，会计每年提的都要调增
      return {
        taxDeductionCents: 0,
        accountingDepreciationCents,
        adjustmentCents: accountingDepreciationCents,
        reason: "one_time_deducted_prior_year"
      };
    }
  }

  const life = resolveTaxLife(asset);
  if (!life.shorterThanMinimum) {
    // 会计年限不短于税法最低年限：税法认可会计折旧额，无差异
    return {
      taxDeductionCents: accountingDepreciationCents,
      accountingDepreciationCents,
      adjustmentCents: 0,
      reason: "aligned"
    };
  }

  // 按税法年限摊：年扣除额 = 可折旧总额 ÷ 税法年限（月）× 12，
  // 但不得超过「可折旧总额 − 已扣除额」——最后一年靠这个收口，避免超扣。
  const base = depreciableBaseCents(asset);
  const annualCents = Math.floor((base / life.taxLifeMonths) * 12);
  const remaining = Math.max(0, base - input.priorTaxDeductionCents);
  const taxDeductionCents = Math.min(annualCents, remaining);

  return {
    taxDeductionCents,
    accountingDepreciationCents,
    adjustmentCents: accountingDepreciationCents - taxDeductionCents,
    reason: "tax_minimum_life"
  };
}

/** 纳税调整的人话说明，直接用在汇算底稿上。 */
export function describeAdjustment(result: TaxDepreciationResult): string {
  const amount = (Math.abs(result.adjustmentCents) / 100).toFixed(2);
  switch (result.reason) {
    case "one_time_deduction":
      return `适用一次性扣除，本年税前扣除全额原值，纳税调减 ${amount}。`;
    case "one_time_deducted_prior_year":
      return `购置年度已一次性扣除完毕，本年会计折旧 ${amount} 全额纳税调增。`;
    case "tax_minimum_life":
      return `会计折旧年限短于税法最低年限，超提部分纳税调增 ${amount}。`;
    case "aligned":
      return "会计折旧与税法口径一致，无需纳税调整。";
  }
}
