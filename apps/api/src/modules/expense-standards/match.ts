/**
 * 费用标准的匹配（V13-A1）。
 *
 * ## 为什么需要「最具体优先」
 *
 * 标准按「费用类型 × 职级 × 城市等级」定义，后两个维度允许留空表示通配。
 * 一次住宿支出常常同时命中多条：通用标准 300/晚、M2 职级 500/晚、一线城市
 * 450/晚、M2 且一线 800/晚。必须有确定的规则挑出一条，否则同一笔支出
 * 换个查询顺序就得出不同限额。
 *
 * 规则是 **具体度优先，职级次之，id 决胜**：
 *
 * 1. 指定的维度越多越优先（M2+一线 > M2 > 通用）；
 * 2. 同为一个维度时职级优先于城市——职级是人的属性，回答的是「这个人能报
 *    多少」，比城市更贴近授权语义；
 * 3. 仍然打平（说明配置重了）时按 id 排序决胜。这不是在掩盖配置错误，而是
 *    保证**错误的表现是稳定的**——「今天算 500 明天算 800」比配错本身更难查。
 *
 * ## 匹配必须带日期
 *
 * 标准会调整（年初上调差旅标准是常事）。历史单据要按**当时**的标准判定，
 * 所以入口参数是 `onDate` 而不是隐含的「今天」。生效区间两端都是闭区间——
 * 「有效期至 3 月 31 日」在会计语境里意味着 31 日当天可用。
 */

/** 超标之后怎么办。`escalate` 触发加签，由审批流引擎接手。 */
export type ExpenseOverPolicy = "block" | "warn" | "escalate";

/** 限额的计量基准。 */
export type ExpenseLimitBasis = "per_day" | "per_time" | "per_month";

export interface ExpenseStandard {
  id: string;
  /** 费用类型，如 travel_hotel / travel_meal / entertainment。 */
  expenseType: string;
  /** 职级；null 表示不限职级。 */
  gradeCode: string | null;
  /** 城市等级，如 tier1；null 表示不限城市。 */
  cityTier: string | null;
  limitCents: number;
  limitBasis: ExpenseLimitBasis;
  overPolicy: ExpenseOverPolicy;
  /** 生效起日（含），YYYY-MM-DD。 */
  effectiveFrom: string;
  /** 生效止日（含），null 表示长期有效。 */
  effectiveTo: string | null;
}

export interface ExpenseStandardContext {
  expenseType: string;
  /** 申请人职级；null 表示未知，此时只匹配通配标准。 */
  gradeCode: string | null;
  /** 目的地城市等级；null 表示未知。 */
  cityTier: string | null;
  /** 判定基准日（费用发生日），YYYY-MM-DD。 */
  onDate: string;
}

/**
 * 一条标准是否适用于给定上下文。
 *
 * 上下文维度为空时**只有通配标准适用**：员工没设职级、城市识别不出来在现实中
 * 很常见，此时套用任何带具体维度的标准都是瞎猜。
 */
function isApplicable(standard: ExpenseStandard, context: ExpenseStandardContext): boolean {
  if (standard.expenseType !== context.expenseType) return false;

  // 日期串是 YYYY-MM-DD 定长格式，字典序即时间序，无需构造 Date 对象——
  // 那会引入时区，而生效期本就是不带时区的业务日期。
  if (context.onDate < standard.effectiveFrom) return false;
  if (standard.effectiveTo !== null && context.onDate > standard.effectiveTo) return false;

  if (standard.gradeCode !== null && standard.gradeCode !== context.gradeCode) return false;
  if (standard.cityTier !== null && standard.cityTier !== context.cityTier) return false;

  return true;
}

/** 具体度评分：职级 2 分、城市 1 分，于是「职级」永远压过「城市」。 */
function specificity(standard: ExpenseStandard): number {
  return (standard.gradeCode !== null ? 2 : 0) + (standard.cityTier !== null ? 1 : 0);
}

/**
 * 从标准库里挑出最适用的一条；没有任何标准适用时返回 `null`。
 *
 * **返回 null 不等于不合规**——很多公司只管几类费用，没配标准是合法状态。
 * 调用方据此放行还是拦截由调用方决定，这里不替它做判断。
 */
export function matchExpenseStandard(
  standards: readonly ExpenseStandard[],
  context: ExpenseStandardContext
): ExpenseStandard | null {
  const applicable = standards.filter((item) => isApplicable(item, context));
  if (applicable.length === 0) return null;

  // 不排序整个数组、也不原地排序入参（入参是 readonly，排序会破坏调用方的数据）。
  return applicable.reduce((best, candidate) => {
    const byScore = specificity(candidate) - specificity(best);
    if (byScore !== 0) return byScore > 0 ? candidate : best;
    return candidate.id < best.id ? candidate : best;
  });
}
