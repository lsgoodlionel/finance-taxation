/**
 * 结转凭证的单测（V14-C）。
 *
 * 方向写反在余额表上一眼可见但要到月末才有人看——这里当场钉住。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCarryoverLines,
  FINISHED_GOODS_ACCOUNT,
  PRODUCTION_COST_ACCOUNT
} from "./voucher.js";

const NAMES = new Map([
  [FINISHED_GOODS_ACCOUNT, "库存商品"],
  [PRODUCTION_COST_ACCOUNT, "生产成本"]
]);

test("借库存商品、贷生产成本——方向不能反", () => {
  const lines = buildCarryoverLines(
    {
      label: "服务器 2026-04",
      finishedByElement: [
        { element: "material", finishedCents: 800_000 },
        { element: "labor", finishedCents: 200_000 },
        { element: "overhead", finishedCents: 100_000 }
      ]
    },
    NAMES
  );

  const debits = lines.filter((line) => line.debitCents > 0);
  const credits = lines.filter((line) => line.creditCents > 0);

  assert.equal(debits.length, 1, "库存商品应当合并成一行——入库的是产品不是三堆成本");
  assert.equal(debits[0]!.accountCode, FINISHED_GOODS_ACCOUNT);
  assert.equal(credits.length, 3, "贷方按成本项分三行");
  assert.ok(credits.every((line) => line.accountCode === PRODUCTION_COST_ACCOUNT));
});

test("借贷相等", () => {
  const lines = buildCarryoverLines(
    {
      label: "服务器 2026-04",
      finishedByElement: [
        { element: "material", finishedCents: 333_333 },
        { element: "labor", finishedCents: 333_333 },
        { element: "overhead", finishedCents: 333_335 }
      ]
    },
    NAMES
  );

  const debit = lines.reduce((sum, line) => sum + line.debitCents, 0);
  const credit = lines.reduce((sum, line) => sum + line.creditCents, 0);
  assert.equal(debit, credit);
  assert.equal(debit, 1_000_001);
});

test("金额为零的成本项不出行", () => {
  const lines = buildCarryoverLines(
    {
      label: "服务器 2026-04",
      finishedByElement: [
        { element: "material", finishedCents: 500_000 },
        { element: "labor", finishedCents: 0 },
        { element: "overhead", finishedCents: 0 }
      ]
    },
    NAMES
  );

  // 零金额分录行不表达任何信息，只会让凭证变长。
  assert.equal(lines.length, 2);
});

test("完工成本全为零时不生成凭证", () => {
  const lines = buildCarryoverLines(
    {
      label: "服务器 2026-04",
      finishedByElement: [
        { element: "material", finishedCents: 0 },
        { element: "labor", finishedCents: 0 }
      ]
    },
    NAMES
  );

  // 一张借贷都是零的凭证比不生成更糟：它会出现在待过账列表里，
  // 而没人知道该拿它怎么办。
  assert.deepEqual(lines, []);
});

test("在产品不出现在分录里", () => {
  // 期末在产品成本本来就留在 4001 的余额里。给它做一笔
  // 「借在产品贷生产成本」是把余额搬到另一个科目，下期还要搬回来。
  const lines = buildCarryoverLines(
    {
      label: "服务器 2026-04",
      finishedByElement: [{ element: "material", finishedCents: 800_000 }]
    },
    NAMES
  );

  assert.equal(lines.length, 2);
  assert.equal(lines.reduce((sum, line) => sum + line.debitCents, 0), 800_000);
});
