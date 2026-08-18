/**
 * 费用标准配置展示逻辑的测试（V13 残留 1）。
 *
 * 最关键的一条：**排序必须与服务端的挑选规则一致**——界面上排第一的
 * 若不是真正生效的那条，用户会照着一个不生效的标准去配。
 */

import { describeScope, groupByType, isActiveOn, specificity } from "./standard-view";
import type { ExpenseStandard } from "../../../lib/api-expense-control";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const BASE: ExpenseStandard = {
  id: "s-generic",
  expenseType: "travel_hotel",
  gradeCode: null,
  cityTier: null,
  limitCents: 30000,
  limitBasis: "per_day",
  overPolicy: "warn",
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
};

// 维度为空说成「不限」而不是留白——空白会被读成「数据没填」
assert(describeScope(BASE) === "不限职级 · 不限城市", "expected explicit scope wording");
assert(
  describeScope({ ...BASE, gradeCode: "M2", cityTier: "tier1" }) === "职级 M2 · 一线城市",
  "expected both dimensions described"
);
// 未知的城市等级退回显示原值，不显示空白
assert(
  describeScope({ ...BASE, cityTier: "tier9" }).includes("tier9"),
  "expected unknown tier to fall back to raw value"
);

// 具体度与服务端 match.ts 同一套：职级 2 分、城市 1 分
assert(specificity(BASE) === 0, "expected generic to score 0");
assert(specificity({ ...BASE, cityTier: "tier1" }) === 1, "expected city to score 1");
assert(specificity({ ...BASE, gradeCode: "M2" }) === 2, "expected grade to outrank city");
assert(
  specificity({ ...BASE, gradeCode: "M2", cityTier: "tier1" }) === 3,
  "expected both to score 3"
);

// 生效期闭区间——与服务端一致
assert(isActiveOn(BASE, "2026-01-01"), "expected start date to be active");
assert(!isActiveOn(BASE, "2025-12-31"), "expected before start to be inactive");
assert(
  isActiveOn({ ...BASE, effectiveTo: "2026-06-30" }, "2026-06-30"),
  "expected end date itself to still be active"
);
assert(
  !isActiveOn({ ...BASE, effectiveTo: "2026-06-30" }, "2026-07-01"),
  "expected after end to be inactive"
);

// 分组排序：更具体的排前面，与服务端挑选顺序一致
const grouped = groupByType([
  BASE,
  { ...BASE, id: "s-both", gradeCode: "M2", cityTier: "tier1" },
  { ...BASE, id: "s-grade", gradeCode: "M2" },
  { ...BASE, id: "s-meal", expenseType: "travel_meal" },
]);

const hotel = grouped.find((group) => group.expenseType === "travel_hotel");
assert(hotel, "expected hotel group");
assert(
  hotel.items.map((item) => item.id).join(",") === "s-both,s-grade,s-generic",
  "expected most specific first, matching server-side match.ts"
);

// 分组要带中文标签，不显示原始 key
assert(hotel.label === "差旅-住宿", "expected Chinese label");

// 未知类型退回显示原 key，不显示空白
const unknown = groupByType([{ ...BASE, expenseType: "custom_type" }]);
assert(unknown[0]!.label === "custom_type", "expected unknown type to show raw key");

// 空列表不抛错
assert(groupByType([]).length === 0, "expected empty grouping");

console.log("standard-view-ok");
