/**
 * 税法加速折旧（V12-D4 二期）。
 *
 * ## 法规依据
 *
 * 《企业所得税法实施条例》第九十八条：由于技术进步、产品更新换代较快，或常年处于
 * 强震动、高腐蚀状态的固定资产，可以缩短折旧年限或者采取加速折旧的方法。
 *
 * - 缩短折旧年限的，**最低折旧年限不得低于第六十条规定年限的 60%**；
 * - 采取加速折旧方法的，可以采用**双倍余额递减法**或者**年数总和法**。
 *
 * ## 只作用于税法口径，不动账簿折旧
 *
 * 本模块算的是**税前扣除额**，进的是《资产折旧、摊销及纳税调整明细表》(A105080)。
 * 账簿上每月计提多少仍由 C1 的 `depreciation.ts` 按会计政策决定 —— 两者不一致
 * 正是纳税调整存在的理由。
 *
 * 会计准则同样允许这两种方法，但改账簿计提会影响真实凭证与已过账的历史数据，
 * 属于另一件事，不夹带在这里。
 */

export type AcceleratedMethod = "double_declining" | "sum_of_years";

/** 税法折旧方法，含不加速的直线法。 */
export type TaxDepreciationMethod = "straight_line" | AcceleratedMethod;

/**
 * 缩短折旧年限的下限比例（实施条例第九十八条）。
 *
 * 按类别换算成月数的 `minimumShortenedLifeMonths` 放在 `tax-depreciation.ts`：
 * 它要用那边的 `taxMinimumLifeMonths`，而那边又要用本模块的排程算法——放这里
 * 就成了循环依赖。本模块保持零依赖的纯算法。
 */
export const MIN_SHORTENED_LIFE_RATIO = 0.6;

export interface AcceleratedScheduleInput {
  originalCostCents: number;
  salvageValueCents: number;
  /** 折旧年限（年）。税法加速折旧按年计算，不按月。 */
  lifeYears: number;
  method: AcceleratedMethod;
}

/** 可折旧总额 = 原值 − 预计净残值，负数按 0。 */
function depreciableBaseCents(input: AcceleratedScheduleInput): number {
  return Math.max(0, input.originalCostCents - input.salvageValueCents);
}

/**
 * 年数总和法：年折旧额 = 可折旧总额 × 尚可使用年数 ÷ 年数总和。
 *
 * 年数总和 = n(n+1)/2。第 1 年权重 n、第 2 年 n−1，依此递减到 1。
 * 末年扫尾：整除不尽的分摊到最后一年，保证各年之和严格等于可折旧总额。
 */
function sumOfYearsSchedule(input: AcceleratedScheduleInput): number[] {
  const base = depreciableBaseCents(input);
  const n = input.lifeYears;
  const denominator = (n * (n + 1)) / 2;

  const schedule: number[] = [];
  let allocated = 0;
  for (let year = 1; year <= n; year += 1) {
    const isFinal = year === n;
    const amount = isFinal
      ? base - allocated
      : Math.floor((base * (n - year + 1)) / denominator);
    schedule.push(amount);
    allocated += amount;
  }
  return schedule;
}

/**
 * 双倍余额递减法。
 *
 * 年折旧率 = 2 ÷ 折旧年限。前期按**账面净值**（原值 − 累计折旧）计提，
 * **不扣减残值** —— 这是这个方法与年数总和法最容易混淆的一点。
 *
 * ## 最后两年必须转直线法
 *
 * 因为前期不扣残值，一直递减下去会**穿透残值**：100 万、5 年、40% 递减是
 * 100 → 60 → 36 → 21.6 → 12.96 → 7.776，末净值 7.776 万，而残值有 10 万——
 * 多提的 2.224 万就是虚增的税前扣除。
 *
 * 所以最后两年改为「(此时净值 − 预计净残值) ÷ 2」平均摊，正好收口在残值上。
 * 这是教科书与税务实务的标准做法，有一条用例专门钉住这个前提。
 *
 * 年限 ≤ 2 时无从分段，直接把可折旧总额平摊——不能因为分段逻辑漏提或报错。
 */
function doubleDecliningSchedule(input: AcceleratedScheduleInput): number[] {
  const base = depreciableBaseCents(input);
  const n = input.lifeYears;

  if (n <= 2) {
    const schedule: number[] = [];
    let allocated = 0;
    for (let year = 1; year <= n; year += 1) {
      const amount = year === n ? base - allocated : Math.floor(base / n);
      schedule.push(amount);
      allocated += amount;
    }
    return schedule;
  }

  const rate = 2 / n;
  const schedule: number[] = [];
  let netValue = input.originalCostCents;

  // 前 n−2 年按净值 × 双倍直线率
  for (let year = 1; year <= n - 2; year += 1) {
    const amount = Math.floor(netValue * rate);
    schedule.push(amount);
    netValue -= amount;
  }

  // 最后两年转直线：把「当前净值 − 残值」平均摊，末年扫尾吃掉除不尽的分
  const remaining = Math.max(0, netValue - input.salvageValueCents);
  const secondToLast = Math.floor(remaining / 2);
  schedule.push(secondToLast, remaining - secondToLast);
  return schedule;
}

/**
 * 按年给出加速折旧的逐年扣除额（分）。
 *
 * 返回数组长度等于 `lifeYears`，各年之和严格等于可折旧总额 —— 多提是虚增税前
 * 扣除，少提是纳税人吃亏，两头都不能有。
 */
export function acceleratedScheduleCents(input: AcceleratedScheduleInput): number[] {
  return input.method === "sum_of_years"
    ? sumOfYearsSchedule(input)
    : doubleDecliningSchedule(input);
}

/** 方法的中文名，直接用在纳税调整底稿上。 */
export function describeTaxDepreciationMethod(method: TaxDepreciationMethod): string {
  switch (method) {
    case "double_declining":
      return "双倍余额递减法";
    case "sum_of_years":
      return "年数总和法";
    case "straight_line":
      return "直线法";
  }
}
