/**
 * 企业所得税优惠资格判定（V17 阶段三批次 A）。
 *
 * ## 这一层解决什么
 *
 * `buildCorporateIncomeTaxPreparation` 此前写死 `const incomeTaxRate = 25`。
 * 高新技术企业（15%）与小型微利企业（实际 5%）都被按一般税率算——
 * 一家小微企业按 25% 预缴，**多交五倍**。
 *
 * ## 为什么小微的两个系数不能合成一个 5%
 *
 * 政策的原文是「减按 25% 计入应纳税所得额，按 20% 的税率缴纳」。
 * 写成 `rate = 5` 数值上一样，但：
 *
 * - 申报表要分别列示「减免税额」，合成一个数就还原不出来
 * - 这两个系数历史上分别调整过（减计比例、征收率各调各的）
 *
 * 所以两个系数分开存，`effectiveRatePercent` 是**算出来的**，不是写死的。
 *
 * 政策依据与完整条件见 `docs/v17-tax-rate-policy/POLICY-MAP-CIT-SURTAX.md`。
 */
import { queryOne } from "../../db/client.js";
import { toDateOnly } from "../../db/date-column.js";

/** 小型微利企业的认定阈值（现行政策，执行至 2027-12-31）。 */
const SMALL_PROFIT_INCOME_CAP_CENTS = 3_000_000_00; // 应纳税所得额 300 万
const SMALL_PROFIT_EMPLOYEE_CAP = 300; // 从业人数 300 人
const SMALL_PROFIT_ASSETS_CAP_CENTS = 5_000_000_000; // 资产总额 5000 万

/** 小型微利：减按 25% 计入应纳税所得额，按 20% 税率征收。 */
const SMALL_PROFIT_INCLUSION_PERCENT = 25;
const SMALL_PROFIT_APPLIED_RATE_PERCENT = 20;

const HIGH_TECH_RATE_PERCENT = 15;
const STANDARD_RATE_PERCENT = 25;

/**
 * 企业的税收资格档案。
 *
 * `null` 与 `0` 语义不同：`null` 是「没登记」，`0` 是「确实是 0」。
 * 前者要报「待确认」，后者是一个有效的判定输入。
 */
export interface TaxQualification {
  /** 从业人数。null = 没登记。 */
  employeeCount: number | null;
  /** 资产总额（分）。null = 没登记。 */
  totalAssetsCents: number | null;
  /**
   * 是否属于国家限制或禁止行业。
   *
   * **这是用户的声明值，不是系统判定的。** 对应的产业目录逐条落进系统
   * 是独立工程，本次不做——字段名不叫 `industryCode` 就是为了不让人
   * 误以为系统认得行业。
   */
  isRestrictedIndustry: boolean;
  /** 高新技术企业资质的有效期止日（YYYY-MM-DD）。null = 没有资质。 */
  highTechCertificateExpiresOn: string | null;
}

export type CorporateIncomeTaxTreatment = {
  kind: "standard" | "high_tech" | "small_profit" | "unknown";
  /** 实际税负（%）。小微情形下是两个系数算出来的，不是写死的。 */
  effectiveRatePercent: number | null;
  /** 小微专用：减按多少比例计入应纳税所得额。其余情形为 null。 */
  reducedInclusionPercent: number | null;
  /** 小微专用：适用的税率。其余情形为 null。 */
  appliedRatePercent: number | null;
  /** 应纳税额（分）。null = 算不出（资格待确认）。 */
  taxAmountCents: number | null;
  /** 可结转以后年度弥补的亏损（分）。非亏损年度为 0。 */
  carryforwardLossCents: number;
  /** 判定结论的说明，直接给用户看。 */
  reason: string;
};

function isHighTechOn(qualification: TaxQualification, on: string): boolean {
  const expiresOn = qualification.highTechCertificateExpiresOn;
  if (!expiresOn) return false;
  // 有效期止日是**含**当天。
  return on <= expiresOn;
}

/**
 * 判定一家企业该按哪一档企业所得税税率，以及应纳税额。
 *
 * 优先级（见 POLICY-MAP-CIT-SURTAX.md 第 4 节）：
 *   1. 高新技术企业（资质在有效期内）→ 15%
 *   2. 小型微利（四个条件同时满足）→ 减按 25% 计入 × 20%
 *   3. 一般企业 → 25%
 *   4. 资格信息缺失且**会影响结论**时 → 不按 25% 兜底，报「待确认」
 */
export function resolveCorporateIncomeTaxTreatment(input: {
  /** 应纳税所得额（分）。可以是负数——亏损年度。 */
  taxableIncomeCents: number;
  qualification: TaxQualification;
  /** 判定基准日，用来看高新资质是否还在有效期内。 */
  on: string;
}): CorporateIncomeTaxTreatment {
  const { taxableIncomeCents: income, qualification, on } = input;

  // 亏损年度：不缴税，但亏损额要带出来供以后年度弥补。
  // 此前 `Math.max(totalProfit, 0)` 把它抹平了——税额是 0 没错，
  // 但「可结转多少亏损」这个信息一起没了。
  const carryforwardLossCents = income < 0 ? -income : 0;

  if (income <= 0) {
    return {
      kind: "standard",
      effectiveRatePercent: null,
      reducedInclusionPercent: null,
      appliedRatePercent: null,
      taxAmountCents: 0,
      carryforwardLossCents,
      reason:
        carryforwardLossCents > 0
          ? "本期亏损，当期不缴企业所得税；亏损额可结转以后年度弥补。"
          : "本期应纳税所得额为 0，当期不缴企业所得税。"
    };
  }

  // 1. 高新优先：15% 一定优于小微以外的任何情形，也优于 25%。
  if (isHighTechOn(qualification, on)) {
    return {
      kind: "high_tech",
      effectiveRatePercent: HIGH_TECH_RATE_PERCENT,
      reducedInclusionPercent: null,
      appliedRatePercent: null,
      taxAmountCents: Math.round((income * HIGH_TECH_RATE_PERCENT) / 100),
      carryforwardLossCents,
      reason: `高新技术企业，减按 ${HIGH_TECH_RATE_PERCENT}% 征收（资质有效期至 ${qualification.highTechCertificateExpiresOn}）。`
    };
  }

  // 2. 小微判定。所得额已经超上限时，人数与资产不用看——
  //    **不确定的是结论，不是信息的完整度**。这时缺信息不影响结论，
  //    不该拦着用户。
  const overIncomeCap = income > SMALL_PROFIT_INCOME_CAP_CENTS;

  if (!overIncomeCap && !qualification.isRestrictedIndustry) {
    const missing: string[] = [];
    if (qualification.employeeCount === null) missing.push("从业人数");
    if (qualification.totalAssetsCents === null) missing.push("资产总额");

    // 4. 缺的信息会改变结论时，**不按 25% 兜底**。
    //
    // 按最高档兜底看起来保守稳妥，实际是静默地让企业多交五倍的税，
    // 而用户看不出这个数字是猜的。与增值税「税目未知不按 13% 兜底」同一口径。
    if (missing.length > 0) {
      return {
        kind: "unknown",
        effectiveRatePercent: null,
        reducedInclusionPercent: null,
        appliedRatePercent: null,
        taxAmountCents: null,
        carryforwardLossCents,
        reason: `算不出适用税率：还没登记${missing.join("、")}，判断不了是否符合小型微利企业条件。补齐后即可计算（不登记就按 25% 算的话，本该按 5% 的企业会多交五倍）。`
      };
    }

    const withinEmployeeCap = qualification.employeeCount! <= SMALL_PROFIT_EMPLOYEE_CAP;
    const withinAssetsCap = qualification.totalAssetsCents! <= SMALL_PROFIT_ASSETS_CAP_CENTS;

    if (withinEmployeeCap && withinAssetsCap) {
      // 减按 25% 计入应纳税所得额，再按 20% 征收。
      const reducedIncome = (income * SMALL_PROFIT_INCLUSION_PERCENT) / 100;
      const taxAmountCents = Math.round((reducedIncome * SMALL_PROFIT_APPLIED_RATE_PERCENT) / 100);
      return {
        kind: "small_profit",
        effectiveRatePercent:
          (SMALL_PROFIT_INCLUSION_PERCENT * SMALL_PROFIT_APPLIED_RATE_PERCENT) / 100,
        reducedInclusionPercent: SMALL_PROFIT_INCLUSION_PERCENT,
        appliedRatePercent: SMALL_PROFIT_APPLIED_RATE_PERCENT,
        taxAmountCents,
        carryforwardLossCents,
        reason: `小型微利企业：应纳税所得额减按 ${SMALL_PROFIT_INCLUSION_PERCENT}% 计入，按 ${SMALL_PROFIT_APPLIED_RATE_PERCENT}% 税率征收，实际税负 5%。`
      };
    }
  }

  // 3. 一般企业。
  return {
    kind: "standard",
    effectiveRatePercent: STANDARD_RATE_PERCENT,
    reducedInclusionPercent: null,
    appliedRatePercent: null,
    taxAmountCents: Math.round((income * STANDARD_RATE_PERCENT) / 100),
    carryforwardLossCents,
    reason: `按法定税率 ${STANDARD_RATE_PERCENT}% 计算。`
  };
}

/**
 * 从公司档案读税收资格。
 *
 * 缺失项保持 `null`，不给默认值——`null`（没登记）与 `0`（确实是 0）
 * 语义不同，判定层要靠这个区别决定是报「待确认」还是照常算。
 */
export async function loadTaxQualification(companyId: string): Promise<TaxQualification> {
  const row = await queryOne<{
    employee_count: number | null;
    total_assets_cents: string | null;
    is_restricted_industry: boolean | null;
    high_tech_certificate_expires_on: string | Date | null;
  }>(
    `select employee_count, total_assets_cents, is_restricted_industry,
            high_tech_certificate_expires_on
       from companies where id = $1`,
    [companyId]
  );

  return {
    employeeCount: row?.employee_count ?? null,
    totalAssetsCents: row?.total_assets_cents == null ? null : Number(row.total_assets_cents),
    isRestrictedIndustry: row?.is_restricted_industry ?? false,
    highTechCertificateExpiresOn: toDateOnly(row?.high_tech_certificate_expires_on ?? null)
  };
}
