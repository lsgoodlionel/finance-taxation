/**
 * 附加税计算：城建税 + 教育费附加 + 地方教育附加（V17 阶段三批次 B）。
 *
 * ## 这一层解决什么
 *
 * `stamp-surtax.ts` 只把税种名含「附加」的税项**筛出来展示**，一分钱都不算。
 * 这些税项要靠人手工建——没人建，页面就永远是空的。
 *
 * ## 计税依据是「实际缴纳」的增值税，不是「应纳」
 *
 * 两者在有留抵、有减免、分期缴纳时都不相等。拿应纳额代替实缴额得到的是
 * 近似值，而用户会拿它去申报——申报表上的数字必须是准的。
 * 所以实缴额未知时**不估算**，报「待主税缴纳后计算」。
 *
 * ## 消费税不在计税依据里
 *
 * 政策上计税依据是「实际缴纳的增值税、消费税」，但系统里没有消费税模块。
 * 这里只按增值税算——**有消费税的企业算出来会偏小**，结果里标明了这一点。
 *
 * 政策依据见 `docs/v17-tax-rate-policy/POLICY-MAP-CIT-SURTAX.md` 第 2.5 节。
 */
import { queryOne } from "../../db/client.js";

/** 城建税税率按纳税人所在地定档（城市维护建设税法）。 */
const URBAN_CONSTRUCTION_RATES: Record<string, number> = {
  city: 7, // 市区
  county: 5, // 县城、镇
  other: 1 // 其他地区
};

const EDUCATION_SURCHARGE_RATE = 3; // 教育费附加
const LOCAL_EDUCATION_SURCHARGE_RATE = 2; // 地方教育附加

/** 六税两费减半：小规模纳税人、小型微利企业、个体工商户减征 50%。 */
const HALVED_REDUCTION_PERCENT = 50;

export type SurtaxResult = {
  kind: "calculated" | "pending_main_tax" | "zone_unknown";
  urbanConstructionCents: number | null;
  educationSurchargeCents: number | null;
  localEducationSurchargeCents: number | null;
  totalCents: number | null;
  /** 六税两费减半减征的金额。申报表上是单独一栏。 */
  reductionCents: number;
  /** 结论说明，直接给用户看。 */
  reason: string;
};

function pending(kind: SurtaxResult["kind"], reason: string): SurtaxResult {
  return {
    kind,
    urbanConstructionCents: null,
    educationSurchargeCents: null,
    localEducationSurchargeCents: null,
    totalCents: null,
    reductionCents: 0,
    reason
  };
}

/**
 * 按比例取整数分。
 *
 * 各项**各自取整**，合计取三项之和——不能对合计单独算一遍百分比，
 * 那样两个数会对不上，而申报表上这四个数是要互相勾稽的。
 */
function applyRate(baseCents: number, ratePercent: number, halved: boolean): number {
  const full = (baseCents * ratePercent) / 100;
  const applied = halved ? (full * (100 - HALVED_REDUCTION_PERCENT)) / 100 : full;
  return Math.round(applied);
}

export function calculateSurtax(input: {
  /**
   * 当期**实际缴纳**的增值税（分）。
   *
   * `null` = 还不知道缴了多少（主税未缴，或系统里没有缴纳记录）。
   * `0` 与 `null` 不同：0 是「确实没缴」，附加税就是 0，是个确定的结论。
   */
  paidVatCents: number | null;
  /** 城建税所在地档位：city / county / other。null = 没登记。 */
  zone: string | null;
  /** 是否适用六税两费减半（小规模纳税人或小型微利企业）。 */
  halvedReduction: boolean;
}): SurtaxResult {
  if (input.paidVatCents === null) {
    return pending(
      "pending_main_tax",
      "附加税以实际缴纳的增值税为计税依据。本期增值税还没有缴纳记录，等主税缴纳后即可计算。"
    );
  }

  if (input.zone === null || !(input.zone in URBAN_CONSTRUCTION_RATES)) {
    // 不默认按市区 7%——那会让县城企业多交 2 个点，
    // 与「按最高档兜底」是同一个错误。
    return pending(
      "zone_unknown",
      "算不出城市维护建设税：还没登记纳税人所在地。市区 7%、县城和镇 5%、其他地区 1%，档位不同税额差好几倍，不能替你选一个。"
    );
  }

  const base = input.paidVatCents;
  const halved = input.halvedReduction;

  const urbanConstructionCents = applyRate(base, URBAN_CONSTRUCTION_RATES[input.zone]!, halved);
  const educationSurchargeCents = applyRate(base, EDUCATION_SURCHARGE_RATE, halved);
  const localEducationSurchargeCents = applyRate(base, LOCAL_EDUCATION_SURCHARGE_RATE, halved);
  const totalCents =
    urbanConstructionCents + educationSurchargeCents + localEducationSurchargeCents;

  // 减征额 = 不减半时的合计 - 实际合计。分别算再相减，与上面各项的取整口径一致。
  const fullTotal =
    applyRate(base, URBAN_CONSTRUCTION_RATES[input.zone]!, false) +
    applyRate(base, EDUCATION_SURCHARGE_RATE, false) +
    applyRate(base, LOCAL_EDUCATION_SURCHARGE_RATE, false);

  return {
    kind: "calculated",
    urbanConstructionCents,
    educationSurchargeCents,
    localEducationSurchargeCents,
    totalCents,
    reductionCents: halved ? fullTotal - totalCents : 0,
    reason: halved
      ? "已按六税两费减半政策减征 50%。计税依据只含增值税——有消费税的话实际金额会更高。"
      : "计税依据只含增值税——有消费税的话实际金额会更高，系统暂不覆盖消费税。"
  };
}

/**
 * 当期**实际缴纳**的某税种金额（分）。
 *
 * 同期多笔要合计——分期缴纳是常见的，只取一笔会算少。
 * 没有任何缴款记录时返回 `null`（不是 0）：**「还没缴」与「缴了 0 元」
 * 是两回事**，前者要报「待主税缴纳后计算」，后者是个确定的结论。
 */
export async function loadPaidTaxCents(
  companyId: string,
  taxType: string,
  filingPeriod: string
): Promise<number | null> {
  const row = await queryOne<{ total: string | null; n: string }>(
    `select sum(amount_cents)::text as total, count(*)::text as n
       from tax_payments
      where company_id = $1 and tax_type = $2 and filing_period = $3`,
    [companyId, taxType, filingPeriod]
  );
  if (!row || row.n === "0") return null;
  return Number(row.total ?? 0);
}
