/**
 * 预算展示逻辑的测试（V13-A2）。
 *
 * 这类判断错了不会崩，只会静静地把超支显示成正常——所以每条都要断言。
 *
 * 用自带的 assert 而不是 node:test：web 的 tsconfig 不含 node 类型，
 * 与 nav-filter.test.ts 等既有 web 测试保持同一写法。
 */

import {
  budgetStatus,
  countOverruns,
  describeDimension,
  utilizationRatio,
} from "./budget-view";
import type { BudgetWithUsage } from "../../lib/api-expense-control";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const BASE: BudgetWithUsage = {
  id: "b1",
  periodType: "month",
  periodKey: "2026-06",
  costCenterId: null,
  accountCode: null,
  amountCents: 100000,
  controlPolicy: "warn",
  note: null,
  encumberedCents: 0,
  actualCents: 0,
  availableCents: 100000,
};

// 可用额度为负即超支
assert(
  budgetStatus({ ...BASE, encumberedCents: 60000, actualCents: 50000, availableCents: -10000 }) ===
    "overrun",
  "expected negative available to be overrun"
);

// 可用额度低于 10% 视为吃紧
assert(
  budgetStatus({ ...BASE, actualCents: 95000, availableCents: 5000 }) === "tight",
  "expected 5% remaining to be tight"
);

// 恰好 10% 不算吃紧——阈值是「低于」而不是「不高于」，差一会让整十的数字反复横跳
assert(
  budgetStatus({ ...BASE, actualCents: 90000, availableCents: 10000 }) === "healthy",
  "expected exactly 10% remaining to stay healthy"
);

// 零预算且未支出算健康。按比例判会得到 0/0 = NaN，而 NaN < 0.1 是 false，
// 恰好也返回 healthy——但那是巧合而非设计，这条锁的是显式处理。
assert(
  budgetStatus({ ...BASE, amountCents: 0, availableCents: 0 }) === "healthy",
  "expected zero budget with zero spend to be healthy"
);

// 零预算但已支出算超支
assert(
  budgetStatus({ ...BASE, amountCents: 0, actualCents: 5000, availableCents: -5000 }) === "overrun",
  "expected zero budget with spend to be overrun"
);

// 零预算的执行率返回 null 而不是数字：返回 0 会在进度条上显示成「0% 已用」，
// 返回 Infinity 会显示成满格，两者都在撒谎。
assert(
  utilizationRatio({ ...BASE, amountCents: 0 }) === null,
  "expected null utilization for zero budget"
);

// 执行率含已占用，不只算已发生——只算已发生会让「批了一堆单还没付款」的部门
// 显示为执行率极低，而那正是预算即将耗尽的时刻。
assert(
  utilizationRatio({ ...BASE, encumberedCents: 30000, actualCents: 20000 }) === 0.5,
  "expected utilization to include encumbrance"
);

// 维度为 null 时说成全公司与不限科目，不留空——空白单元格会被读成「数据没填」
assert(
  describeDimension(BASE) === "全公司 · 不限科目",
  "expected null dimensions to render as explicit words"
);

// 有成本中心名时显示名称
assert(
  describeDimension({ ...BASE, costCenterId: "cc-rnd", accountCode: "6602" }, "研发部") ===
    "研发部 · 6602",
  "expected cost center name to be used"
);

// 取不到名称时退回显示 id，不显示空白
assert(
  describeDimension({ ...BASE, costCenterId: "cc-rnd" }) === "cc-rnd · 不限科目",
  "expected fallback to id when name is unknown"
);

// 汇总只数超支条数，不做金额求和：不同期间、不同维度的预算相加是重复计算
assert(
  countOverruns([
    BASE,
    { ...BASE, id: "b2", availableCents: -100 },
    { ...BASE, id: "b3", availableCents: -1 },
  ]) === 2,
  "expected two overruns counted"
);

console.log("budget-view-ok");
