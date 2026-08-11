/**
 * 直线法折旧计算（V12-C1）。
 *
 * ## 为什么是纯函数
 *
 * 折旧的会计规则不多，但每一条错了都是**系统性错账**：不是某张凭证错，是这家公司
 * 每个月的费用都错、每期的资产净值都错，而且要到年审才被发现。所以规则全部收在
 * 这个不碰数据库的模块里，用例把每条规则单独钉住。
 *
 * ## 四条中国准则规则（与 Odoo 默认行为不同，不能照搬）
 *
 * 1. **当月增加的固定资产，当月不提折旧，从下月起计提。**
 *    Odoo 默认按天摊（`prorata`），一台 6 月 20 日买的设备当月就摊 10 天。
 *    中国准则是整月口径，购置当月一分不提。载体是 `depreciationStartPeriod`
 *    —— 建卡时就算成购置次月，而不是在这里反复判断"是不是购置当月"。
 *
 * 2. **当月减少的固定资产，当月照提折旧，下月起停提。**
 *    容易写反成"处置当月就停"，那样处置月的费用会少提一个月。
 *
 * 3. **已提足折旧的固定资产，不论能否继续使用，均不再计提。**
 *    只按"到没到使用月数"判断是不够的 —— 中途补提、减值等都会让累计提前提足。
 *    所以判据是**累计折旧额**，不是已折旧月数。
 *
 * 4. **提前报废的固定资产，不再补提折旧。**
 *    规则 2 的另一面：停提就是停提，不追补剩余月份。
 *
 * ## 为什么用「分」
 *
 * 月折旧额几乎必然除不尽（10000/3）。用浮点累加 60 次，累计折旧会和
 * 原值−残值差出几分钱，而资产处置时这个差额会变成一笔凭空的处置损益。
 * 整数分 + 末期扫尾（{@link depreciationForPeriod} 的 `final_trim`）保证
 * **累计折旧恰好等于原值 − 残值**。
 */

/** 折旧期间形如 `YYYY-MM`。 */
const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface DepreciableAsset {
  /** 入账原值（分）。 */
  originalCostCents: number;
  /** 预计净残值（分）。 */
  salvageValueCents: number;
  /** 预计使用月数。 */
  usefulLifeMonths: number;
  /** 开始计提折旧的期间 `YYYY-MM`，建卡时即为购置次月（规则 1）。 */
  depreciationStartPeriod: string;
  /** 处置期间 `YYYY-MM`；该月仍计提，次月起停（规则 2）。未处置为 null。 */
  disposedPeriod: string | null;
}

export type DepreciationReason =
  /** 按标准月折旧额计提。 */
  | "normal"
  /** 末期扫尾：剩余可提折旧额不足一个标准月额，一次提完。 */
  | "final_trim"
  /** 尚未到开始折旧的期间（规则 1）。 */
  | "not_started"
  /** 已提足（规则 3）。 */
  | "fully_depreciated"
  /** 处置次月及以后（规则 2、4）。 */
  | "disposed";

export interface DepreciationOutcome {
  amountCents: number;
  reason: DepreciationReason;
}

function parsePeriod(period: string): { year: number; month: number } {
  if (!PERIOD_PATTERN.test(period)) {
    throw new Error(`折旧期间必须形如 YYYY-MM，收到 ${period}`);
  }
  return { year: Number(period.slice(0, 4)), month: Number(period.slice(5, 7)) };
}

/** `to` 减 `from` 的月份数；`to` 早于 `from` 时为负。 */
export function periodDiffMonths(from: string, to: string): number {
  const a = parsePeriod(from);
  const b = parsePeriod(to);
  return (b.year - a.year) * 12 + (b.month - a.month);
}

/** 期间加 N 个月，跨年进位。用于由购置月推出开始折旧月。 */
export function addMonths(period: string, months: number): string {
  const { year, month } = parsePeriod(period);
  // 先转成"从 0 年 0 月起的绝对月序"，避免手写进位边界（12 月 +1）
  const absolute = year * 12 + (month - 1) + months;
  const nextYear = Math.floor(absolute / 12);
  const nextMonth = (absolute % 12) + 1;
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}`;
}

/** 可计提折旧总额 = 原值 − 预计净残值，负数按 0 处理。 */
export function depreciableBaseCents(asset: DepreciableAsset): number {
  return Math.max(0, asset.originalCostCents - asset.salvageValueCents);
}

/**
 * 标准月折旧额（分），**向下取整**。
 *
 * 取整方向不是随意的：向下取整让余数累积到最后一期由扫尾一次补齐；向上取整会导致
 * 中间某一期就提超，再回头往下调，形成"折旧额忽大忽小"的账面波动。
 */
export function monthlyDepreciationCents(asset: DepreciableAsset): number {
  if (asset.usefulLifeMonths <= 0) return 0;
  return Math.floor(depreciableBaseCents(asset) / asset.usefulLifeMonths);
}

/**
 * 某一期应计提的折旧额。
 *
 * `accumulatedCents` 是**本期之前**已累计计提的折旧额，由调用方从折旧明细表汇总
 * 得出。把它作为入参而不是在内部推算，是因为累计折旧可能因补提、期初建账时的
 * 存量资产而不等于「月折旧额 × 已过月数」—— 推算会在这些场景下静默算错。
 */
export function depreciationForPeriod(
  asset: DepreciableAsset,
  period: string,
  accumulatedCents: number
): DepreciationOutcome {
  // 规则 2/4：处置次月及以后停提（处置当月仍提，故用 > 而非 >=）
  if (asset.disposedPeriod && periodDiffMonths(asset.disposedPeriod, period) > 0) {
    return { amountCents: 0, reason: "disposed" };
  }

  // 规则 1：未到开始折旧期间
  if (periodDiffMonths(asset.depreciationStartPeriod, period) < 0) {
    return { amountCents: 0, reason: "not_started" };
  }

  // 处置期间早于开始折旧期间（当月购入当月处置）：从未进入计提区间
  if (asset.disposedPeriod && periodDiffMonths(asset.depreciationStartPeriod, asset.disposedPeriod) < 0) {
    return { amountCents: 0, reason: "disposed" };
  }

  // 规则 3：判据是累计折旧额，不是已折旧月数
  const remaining = depreciableBaseCents(asset) - accumulatedCents;
  if (remaining <= 0) {
    return { amountCents: 0, reason: "fully_depreciated" };
  }

  const monthly = monthlyDepreciationCents(asset);
  if (monthly <= 0) {
    return { amountCents: 0, reason: "fully_depreciated" };
  }

  // 末期扫尾。两个判据缺一不可：
  //   a) 本期已是生命周期最后一期 —— 向下取整攒下的余数必须在这里补齐，
  //      否则 (100.00 / 3) 会提三期 33.33 再溢出出一期 0.01，凭空多一个月的费用；
  //   b) 剩余可提额已不足一个标准月额 —— 例如中途补提过，提前触底。
  const isFinalMonth = periodDiffMonths(asset.depreciationStartPeriod, period) >= asset.usefulLifeMonths - 1;
  if (isFinalMonth || remaining <= monthly) {
    return { amountCents: remaining, reason: "final_trim" };
  }

  return { amountCents: monthly, reason: "normal" };
}
