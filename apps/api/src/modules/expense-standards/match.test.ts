/**
 * 费用标准匹配的测试（V13-A1）。
 *
 * 标准库按「费用类型 × 职级 × 城市等级」三个维度定义限额，其中职级与城市允许
 * 留空表示通配。于是同一笔支出往往命中多条标准，必须有确定的**最具体优先**规则——
 * 否则「同一个人同一次出差，两次打开算出不同限额」这种事迟早发生。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { matchExpenseStandard, type ExpenseStandard } from "./match.js";

const GENERIC: ExpenseStandard = {
  id: "std-generic",
  expenseType: "travel_hotel",
  gradeCode: null,
  cityTier: null,
  limitCents: 30000,
  limitBasis: "per_day",
  overPolicy: "warn",
  effectiveFrom: "2026-01-01",
  effectiveTo: null
};

const BY_GRADE: ExpenseStandard = {
  ...GENERIC,
  id: "std-grade",
  gradeCode: "M2",
  limitCents: 50000
};

const BY_CITY: ExpenseStandard = {
  ...GENERIC,
  id: "std-city",
  cityTier: "tier1",
  limitCents: 45000
};

const BY_BOTH: ExpenseStandard = {
  ...GENERIC,
  id: "std-both",
  gradeCode: "M2",
  cityTier: "tier1",
  limitCents: 80000
};

const CONTEXT = { expenseType: "travel_hotel", gradeCode: "M2", cityTier: "tier1", onDate: "2026-06-15" };

test("两个维度都指定的标准优先于只指定一个的", () => {
  // Arrange：四条标准全部命中
  const all = [GENERIC, BY_GRADE, BY_CITY, BY_BOTH];

  // Act
  const matched = matchExpenseStandard(all, CONTEXT);

  // Assert
  assert.equal(matched?.id, "std-both");
});

test("同为一个维度时职级优先于城市", () => {
  // 职级是人的属性，回答的是「这个人能报多少」，比城市更贴近授权语义。
  // 这条规则本身是个约定，重要的是**它是确定的**——不能靠数组顺序。
  const matched = matchExpenseStandard([GENERIC, BY_CITY, BY_GRADE], CONTEXT);

  assert.equal(matched?.id, "std-grade");
});

test("入参顺序不影响结果", () => {
  // 上一条锁的是规则，这条锁的是「规则不被数组顺序污染」。
  const forward = matchExpenseStandard([GENERIC, BY_GRADE, BY_CITY, BY_BOTH], CONTEXT);
  const reversed = matchExpenseStandard([BY_BOTH, BY_CITY, BY_GRADE, GENERIC], CONTEXT);

  assert.equal(forward?.id, reversed?.id);
});

test("维度值不匹配的标准不参与竞争", () => {
  // M3 的标准对 M2 的人不适用，即便它更具体。
  const forOtherGrade: ExpenseStandard = { ...BY_BOTH, id: "std-m3", gradeCode: "M3", limitCents: 200000 };
  const matched = matchExpenseStandard([GENERIC, forOtherGrade], CONTEXT);

  assert.equal(matched?.id, "std-generic");
});

test("费用类型不同一律不匹配", () => {
  const entertainment: ExpenseStandard = { ...BY_BOTH, id: "std-ent", expenseType: "entertainment" };
  const matched = matchExpenseStandard([entertainment], CONTEXT);

  assert.equal(matched, null);
});

test("未生效与已失效的标准都不匹配", () => {
  // 标准调整是常事（比如年初上调差旅标准），历史单据必须按当时的标准判定，
  // 所以匹配一定要带日期，不能只看「当前有效」。
  const future: ExpenseStandard = { ...GENERIC, id: "std-future", effectiveFrom: "2026-12-01" };
  const expired: ExpenseStandard = { ...GENERIC, id: "std-expired", effectiveTo: "2026-03-31" };

  assert.equal(matchExpenseStandard([future], CONTEXT), null);
  assert.equal(matchExpenseStandard([expired], CONTEXT), null);
});

test("effectiveTo 当天仍然有效（闭区间）", () => {
  // 半开半闭区间是经典的差一错误来源。会计上「有效期至 3 月 31 日」意味着
  // 31 日当天可用，写成开区间会让最后一天的单据用错标准。
  const endsToday: ExpenseStandard = { ...GENERIC, id: "std-ends", effectiveTo: "2026-06-15" };
  const matched = matchExpenseStandard([endsToday], CONTEXT);

  assert.equal(matched?.id, "std-ends");
});

test("effectiveFrom 当天即生效（闭区间）", () => {
  const startsToday: ExpenseStandard = { ...GENERIC, id: "std-starts", effectiveFrom: "2026-06-15" };

  assert.equal(matchExpenseStandard([startsToday], CONTEXT)?.id, "std-starts");
});

test("没有任何标准时返回 null 而不是抛错", () => {
  // 没配标准是合法状态（很多公司只管几类费用），此时应放行而不是拦截。
  // 返回 null 让调用方去决定，比在这里抛错更诚实。
  assert.equal(matchExpenseStandard([], CONTEXT), null);
});

test("上下文维度为空时只匹配通配标准", () => {
  // 员工没设职级、城市识别不出来——现实中很常见。此时不该套用任何带具体
  // 维度的标准（那等于瞎猜），只有通配标准适用。
  const matched = matchExpenseStandard([GENERIC, BY_GRADE, BY_BOTH], {
    expenseType: "travel_hotel",
    gradeCode: null,
    cityTier: null,
    onDate: "2026-06-15"
  });

  assert.equal(matched?.id, "std-generic");
});

test("同具体度同维度时按 id 决胜，保证结果稳定", () => {
  // 数据配重了（同类型同职级同城市两条标准）是配置错误，但校验必须仍然
  // 给出确定结果——否则「今天算 500 明天算 800」会比配置错误本身更难查。
  const dupA: ExpenseStandard = { ...BY_BOTH, id: "std-aaa", limitCents: 50000 };
  const dupB: ExpenseStandard = { ...BY_BOTH, id: "std-bbb", limitCents: 90000 };

  assert.equal(matchExpenseStandard([dupA, dupB], CONTEXT)?.id, "std-aaa");
  assert.equal(matchExpenseStandard([dupB, dupA], CONTEXT)?.id, "std-aaa");
});
