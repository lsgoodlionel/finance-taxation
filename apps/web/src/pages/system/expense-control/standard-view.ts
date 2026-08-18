/**
 * 费用标准配置的展示逻辑（V13 残留 1）。
 *
 * 标准的三个维度（类型 × 职级 × 城市）与三种策略要让人一眼看懂谁管谁——
 * 配错了不会报错，只会让超标检查在该拦的时候不拦。
 */

import type { ExpenseOverPolicy, ExpenseStandard, ExpenseLimitBasis } from "../../../lib/api-expense-control";

export const EXPENSE_TYPE_OPTIONS = [
  { value: "travel_hotel", label: "差旅-住宿" },
  { value: "travel_meal", label: "差旅-餐补" },
  { value: "travel_transport", label: "差旅-交通" },
  { value: "entertainment", label: "业务招待" },
  { value: "office", label: "办公用品" },
  { value: "communication", label: "通讯" },
  { value: "training", label: "培训" },
  { value: "other", label: "其他" }
] as const;

export const LIMIT_BASIS_LABELS: Record<ExpenseLimitBasis, string> = {
  per_day: "每天",
  per_time: "每次",
  per_month: "每月"
};

export const OVER_POLICY_META: Record<
  ExpenseOverPolicy,
  { label: string; color: string; hint: string }
> = {
  warn: { label: "提示", color: "gold", hint: "超了仍可提交，审批人会看到" },
  escalate: { label: "加签", color: "orange", hint: "超了可提交，但要多一级审批" },
  block: { label: "拦截", color: "red", hint: "超了不许提交" }
};

export const CITY_TIER_LABELS: Record<string, string> = {
  tier1: "一线城市",
  tier2: "二线城市",
  tier3: "其他城市"
};

/**
 * 一条标准的适用范围描述。
 *
 * 维度为空要说成「不限职级」而不是留白——空白会被读成「数据没填」，
 * 而它其实是「这条管所有人」这个明确的语义。
 */
export function describeScope(standard: ExpenseStandard): string {
  const grade = standard.gradeCode === null ? "不限职级" : `职级 ${standard.gradeCode}`;
  const city =
    standard.cityTier === null
      ? "不限城市"
      : CITY_TIER_LABELS[standard.cityTier] ?? standard.cityTier;
  return `${grade} · ${city}`;
}

/** 是否在给定日期仍然有效。生效期两端都是闭区间。 */
export function isActiveOn(standard: ExpenseStandard, today: string): boolean {
  if (today < standard.effectiveFrom) return false;
  return standard.effectiveTo === null || today <= standard.effectiveTo;
}

/**
 * 具体度：与服务端 `match.ts` 的评分同一套（职级 2 分、城市 1 分）。
 *
 * 界面上按它排序，让「更具体的标准排在前面」——用户就能看出同一类费用下
 * 哪条会实际生效。这个顺序必须与服务端的挑选规则一致，否则用户看到的
 * 第一条不是真正生效的那条。
 */
export function specificity(standard: ExpenseStandard): number {
  return (standard.gradeCode !== null ? 2 : 0) + (standard.cityTier !== null ? 1 : 0);
}

/** 按费用类型分组，组内按具体度倒序（与服务端挑选顺序一致）。 */
export function groupByType(
  standards: readonly ExpenseStandard[]
): { expenseType: string; label: string; items: ExpenseStandard[] }[] {
  const map = new Map<string, ExpenseStandard[]>();
  for (const standard of standards) {
    const list = map.get(standard.expenseType) ?? [];
    list.push(standard);
    map.set(standard.expenseType, list);
  }
  return [...map.entries()]
    .map(([expenseType, items]) => ({
      expenseType,
      label:
        EXPENSE_TYPE_OPTIONS.find((option) => option.value === expenseType)?.label ?? expenseType,
      items: [...items].sort((a, b) => {
        const byScore = specificity(b) - specificity(a);
        // 同具体度按 id——与服务端的 tiebreak 一致，保证顺序稳定。
        return byScore !== 0 ? byScore : a.id < b.id ? -1 : 1;
      })
    }))
    .sort((a, b) => (a.label < b.label ? -1 : 1));
}

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}
