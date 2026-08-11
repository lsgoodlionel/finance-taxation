/**
 * 税率解析（V12-D2）。
 *
 * ## 按日期取税率，不是按"现在"
 *
 * 这是整个模块存在的理由。增值税基本税率改过两次（17→16→13），低税率同步
 * （11→10→9）。一张 2018 年 3 月的发票要用 17%，2018 年 6 月的用 16%，
 * 2019 年 5 月的用 13% —— 用"当前税率"重算旧期间的底稿，算出来的每个数
 * 都是错的，而且错得很隐蔽：金额看着合理，只是和当年申报的对不上。
 *
 * 所以解析函数的入参里**日期是必需的**，没有"默认取最新"这个选项。
 *
 * ## 征收率与实际征收率
 *
 * `rate` 是法定税率/征收率，`levyRate` 是实际征收比例。小规模纳税人当前是
 * 「按 3% 征收率、减按 1% 征收」——算税用 1%，底稿上两个数都要列。
 * {@link effectiveRateOf} 给出算税该用的那个。
 */

export interface TaxRate {
  id: string;
  companyId: string | null;
  taxType: string;
  code: string;
  name: string;
  /** 法定税率/征收率，百分数：13% 为 13。 */
  rate: number;
  /** 实际征收率；null 表示按 rate 全额征收。 */
  levyRate: number | null;
  taxpayerType: "general_vat" | "small_scale" | "general_simplified" | null;
  applicableScope: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  sortOrder: number;
}

/** 算税实际该用的比例（百分数）。减征时用 levyRate，否则用 rate。 */
export function effectiveRateOf(rate: TaxRate): number {
  return rate.levyRate ?? rate.rate;
}

/** 该税率在指定日期是否生效。区间两端都是闭的。 */
export function isEffectiveOn(rate: TaxRate, on: string): boolean {
  if (on < rate.effectiveFrom) return false;
  if (rate.effectiveTo && on > rate.effectiveTo) return false;
  return true;
}

export interface ResolveRateQuery {
  taxType: string;
  code: string;
  /** 业务发生日 `YYYY-MM-DD`。**必需** —— 见模块头注。 */
  on: string;
  taxpayerType?: TaxRate["taxpayerType"];
}

/**
 * 按 code + 日期取唯一生效的税率。
 *
 * 公司自定义税率优先于系统内置：同一个 code 两者都有时，用公司自己的那条。
 * 这让企业能覆盖某档税率（如核定征收的特殊比例）而不必改系统数据。
 *
 * 找不到时返回 null 而不是兜底一个"常见值" —— 兜底会让"这个业务在这个
 * 时点到底该用哪档税率"这个问题被静默糊弄过去，而它恰恰是本模块要回答的。
 */
export function resolveTaxRate(
  rates: readonly TaxRate[],
  query: ResolveRateQuery
): TaxRate | null {
  const candidates = rates.filter(
    (rate) =>
      rate.taxType === query.taxType &&
      rate.code === query.code &&
      isEffectiveOn(rate, query.on) &&
      (query.taxpayerType === undefined ||
        rate.taxpayerType === null ||
        rate.taxpayerType === query.taxpayerType)
  );
  if (candidates.length === 0) return null;

  // 公司自定义优先；同为自定义或同为内置时取生效日最晚的那条
  // （正常数据下同一 code 在同一天只会有一条生效，这里只是把顺序定死，
  //  免得数据有重叠区间时结果随数组顺序漂移）
  return candidates.sort((a, b) => {
    if ((a.companyId === null) !== (b.companyId === null)) {
      return a.companyId === null ? 1 : -1;
    }
    return a.effectiveFrom < b.effectiveFrom ? 1 : -1;
  })[0]!;
}

/** 某税种在指定日期可选的全部税率，供税率选择器与底稿列示。 */
export function listEffectiveRates(
  rates: readonly TaxRate[],
  taxType: string,
  on: string,
  taxpayerType?: TaxRate["taxpayerType"]
): TaxRate[] {
  const seen = new Map<string, TaxRate>();
  for (const rate of rates) {
    if (rate.taxType !== taxType) continue;
    if (!isEffectiveOn(rate, on)) continue;
    if (
      taxpayerType !== undefined &&
      rate.taxpayerType !== null &&
      rate.taxpayerType !== taxpayerType
    ) {
      continue;
    }
    const existing = seen.get(rate.code);
    // 同 code 撞上时沿用 resolveTaxRate 的优先级：公司自定义压过系统内置
    if (!existing || (existing.companyId === null && rate.companyId !== null)) {
      seen.set(rate.code, rate);
    }
  }
  return [...seen.values()].sort((a, b) => a.sortOrder - b.sortOrder || a.rate - b.rate);
}

/**
 * 税率的人话表述，直接用在底稿上。
 *
 * 减征时必须把两个数都写出来——「3%」和「1%」单独出现都不足以让审核人
 * 看懂这笔税是怎么算的。
 */
export function describeRate(rate: TaxRate): string {
  if (rate.levyRate !== null && rate.levyRate !== rate.rate) {
    return `${rate.rate}% 征收率，减按 ${rate.levyRate}% 征收`;
  }
  return `${rate.rate}%`;
}
