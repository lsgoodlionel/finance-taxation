/**
 * 约当产量法的单测（V14-C）。
 *
 * 最重要的一条是**平衡护栏**（蓝图护栏 3）：
 * `完工成本 + 期末在产品 ≡ 期初 + 本期归集`，一分不差。
 *
 * 差一分不是「差一分」——分配结果最终要变成凭证的多行分录，
 * 少一分就是借贷不平、过不了账。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateByEquivalentUnits,
  TOTAL_BASIS_POINTS,
  type EquivalentUnitsInput
} from "./equivalent-units.js";

/** 平衡断言。每个用例都过一遍——这是护栏 3。 */
function assertBalanced(result: ReturnType<typeof allocateByEquivalentUnits>): void {
  assert.equal(
    result.totalFinishedCents + result.totalEndingWipCents,
    result.totalInputCents,
    "完工成本 + 期末在产品 ≠ 期初 + 本期归集"
  );
  for (const element of result.elements) {
    assert.equal(Number.isInteger(element.finishedCents), true, "完工成本不是整数分");
    assert.equal(Number.isInteger(element.endingWipCents), true, "在产品成本不是整数分");
    assert.ok(element.finishedCents >= 0);
    assert.ok(element.endingWipCents >= 0);
  }
}

test("材料 100% 投料、人工与制费按加工进度——三项分开算", () => {
  // 完工 80 台，在产 20 台加工到一半。
  // 材料：约当 = 80 + 20×100% = 100，完工分走 80%
  // 人工：约当 = 80 + 20×50%  = 90， 完工分走 80/90
  const result = allocateByEquivalentUnits({
    finishedQuantity: 80,
    endingWipQuantity: 20,
    elements: [
      { element: "material", openingWipCents: 0, incurredCents: 1_000_000, wipCompletionBp: 10000 },
      { element: "labor", openingWipCents: 0, incurredCents: 900_000, wipCompletionBp: 5000 },
      { element: "overhead", openingWipCents: 0, incurredCents: 450_000, wipCompletionBp: 5000 }
    ]
  });

  const material = result.elements.find((e) => e.element === "material")!;
  assert.equal(material.finishedCents, 800_000, "材料完工成本应当是 80%");
  assert.equal(material.endingWipCents, 200_000);

  const labor = result.elements.find((e) => e.element === "labor")!;
  // 900000 × 80/90 = 800000
  assert.equal(labor.finishedCents, 800_000);
  assert.equal(labor.endingWipCents, 100_000);

  assertBalanced(result);
});

test("同一个完工程度打天下会高估完工成本——这是分开算的理由", () => {
  const base: EquivalentUnitsInput = {
    finishedQuantity: 80,
    endingWipQuantity: 20,
    elements: [
      { element: "material", openingWipCents: 0, incurredCents: 1_000_000, wipCompletionBp: 10000 }
    ]
  };
  const correct = allocateByEquivalentUnits(base);

  // 错误做法：材料也按 50% 加工进度算。
  const wrong = allocateByEquivalentUnits({
    ...base,
    elements: [{ ...base.elements[0]!, wipCompletionBp: 5000 }]
  });

  // 按 50% 算会让在产品的约当量变小，分母跟着变小，完工产品反而多分到
  // 材料成本——而那 20 台在产品里的材料是齐的，它们就该背这一份。
  assert.equal(correct.totalFinishedCents, 800_000);
  assert.equal(wrong.totalFinishedCents, 888_888, "完工被高估了近 9 万");
  assert.ok(wrong.totalFinishedCents > correct.totalFinishedCents);
  // 两种算法都必须自平衡，错的只是分给谁。
  assertBalanced(correct);
  assertBalanced(wrong);
});

test("除不尽时余数全部留给在产品，合计仍然严丝合缝", () => {
  // 1000001 分给 3 个约当单位，怎么都除不尽。
  const result = allocateByEquivalentUnits({
    finishedQuantity: 1,
    endingWipQuantity: 2,
    elements: [
      { element: "material", openingWipCents: 0, incurredCents: 1_000_001, wipCompletionBp: 10000 }
    ]
  });

  assertBalanced(result);
  const material = result.elements[0]!;
  // 截断而不是四舍五入：1000001 × 1/3 = 333333.67 → 333333
  assert.equal(material.finishedCents, 333_333);
  assert.equal(material.endingWipCents, 666_668);
});

test("期初在产品成本与本期归集一起参与分配", () => {
  const result = allocateByEquivalentUnits({
    finishedQuantity: 50,
    endingWipQuantity: 50,
    elements: [
      {
        element: "material",
        openingWipCents: 400_000,
        incurredCents: 600_000,
        wipCompletionBp: 10000
      }
    ]
  });

  // 期初 + 本期 = 100 万，约当 100 台，完工 50 台分走一半。
  assert.equal(result.elements[0]!.finishedCents, 500_000);
  assert.equal(result.totalInputCents, 1_000_000);
  assertBalanced(result);
});

test("没有在产品时全部结转", () => {
  const result = allocateByEquivalentUnits({
    finishedQuantity: 100,
    endingWipQuantity: 0,
    elements: [
      { element: "material", openingWipCents: 0, incurredCents: 999_999, wipCompletionBp: 10000 }
    ]
  });
  assert.equal(result.totalFinishedCents, 999_999);
  assert.equal(result.totalEndingWipCents, 0);
  assertBalanced(result);
});

test("没有完工时全部留在在产品", () => {
  const result = allocateByEquivalentUnits({
    finishedQuantity: 0,
    endingWipQuantity: 30,
    elements: [
      { element: "labor", openingWipCents: 0, incurredCents: 777_777, wipCompletionBp: 3000 }
    ]
  });
  assert.equal(result.totalFinishedCents, 0);
  assert.equal(result.totalEndingWipCents, 777_777);
  assertBalanced(result);
});

test("在产品完工程度为零时，成本全部归完工产品", () => {
  // 刚投料还没开工的在产品，对人工与制费的约当量是零。
  const result = allocateByEquivalentUnits({
    finishedQuantity: 10,
    endingWipQuantity: 5,
    elements: [
      { element: "labor", openingWipCents: 0, incurredCents: 100_000, wipCompletionBp: 0 }
    ]
  });
  assert.equal(result.elements[0]!.finishedCents, 100_000);
  assert.equal(result.elements[0]!.endingWipCents, 0);
  assertBalanced(result);
});

test("既没有完工也没有在产品却归集了成本——报错而不是静默留在在产品", () => {
  // 留下来会让 5001 生产成本挂一个数量为零的余额，永远不会被结转，
  // 也没人知道它是什么。
  assert.throws(
    () =>
      allocateByEquivalentUnits({
        finishedQuantity: 0,
        endingWipQuantity: 0,
        elements: [
          { element: "material", openingWipCents: 0, incurredCents: 500_000, wipCompletionBp: 10000 }
        ]
      }),
    /完工数量与在产品数量都是零/
  );
});

test("零产量零成本不报错——这个期间什么都没发生", () => {
  const result = allocateByEquivalentUnits({
    finishedQuantity: 0,
    endingWipQuantity: 0,
    elements: [
      { element: "material", openingWipCents: 0, incurredCents: 0, wipCompletionBp: 10000 }
    ]
  });
  assert.equal(result.totalInputCents, 0);
  assertBalanced(result);
});

test("非整数分、负数、重复成本项都被拒", () => {
  const valid = {
    finishedQuantity: 10,
    endingWipQuantity: 0,
    elements: [
      { element: "material" as const, openingWipCents: 0, incurredCents: 100, wipCompletionBp: 10000 }
    ]
  };

  assert.throws(
    () =>
      allocateByEquivalentUnits({
        ...valid,
        elements: [{ ...valid.elements[0]!, incurredCents: 100.5 }]
      }),
    /整数分/
  );

  // 负的归集不是没有可能（红冲），但那该走单独的调整流程——
  // 混进正常结转会让分摊比例变成负数，结果没有任何意义。
  assert.throws(
    () =>
      allocateByEquivalentUnits({
        ...valid,
        elements: [{ ...valid.elements[0]!, incurredCents: -100 }]
      }),
    /不得为负/
  );

  assert.throws(
    () =>
      allocateByEquivalentUnits({
        ...valid,
        elements: [valid.elements[0]!, valid.elements[0]!]
      }),
    /重复/
  );

  assert.throws(
    () => allocateByEquivalentUnits({ ...valid, finishedQuantity: 10.5 }),
    /必须是整数/
  );
});

test("完工程度超出 0–10000 基点被拒", () => {
  const build = (bp: number) =>
    allocateByEquivalentUnits({
      finishedQuantity: 10,
      endingWipQuantity: 5,
      elements: [
        { element: "material", openingWipCents: 0, incurredCents: 100, wipCompletionBp: bp }
      ]
    });

  assert.throws(() => build(-1), /完工程度/);
  assert.throws(() => build(TOTAL_BASIS_POINTS + 1), /完工程度/);
  assert.doesNotThrow(() => build(TOTAL_BASIS_POINTS));
});

test("大量随机组合下平衡恒成立", () => {
  // 扫尾逻辑最容易在「刚好差一分」的边界上出错，而那种错误在单个用例里
  // 撞不上。这里用一批数据把边界扫一遍。
  for (let finished = 0; finished <= 7; finished += 1) {
    for (let wip = 0; wip <= 7; wip += 1) {
      for (const cents of [0, 1, 7, 99, 100_003, 999_999]) {
        if (finished === 0 && wip === 0 && cents > 0) continue; // 这一组按设计报错
        const result = allocateByEquivalentUnits({
          finishedQuantity: finished,
          endingWipQuantity: wip,
          elements: [
            { element: "material", openingWipCents: 0, incurredCents: cents, wipCompletionBp: 10000 },
            { element: "labor", openingWipCents: 0, incurredCents: cents, wipCompletionBp: 3333 },
            { element: "overhead", openingWipCents: cents, incurredCents: 0, wipCompletionBp: 6667 }
          ]
        });
        assertBalanced(result);
      }
    }
  }
});
