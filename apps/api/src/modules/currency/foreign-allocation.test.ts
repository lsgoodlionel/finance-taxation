/**
 * 外币凭证的原币逐行分摊（V12-D5 录入侧）。
 *
 * 凭证是模板驱动的：用户给一个总额，模板展开成多行（借贷各若干行，金额可能不等，
 * 如价税分离）。外币业务下**原币金额是权威输入、本位币是折算结果**——反过来按
 * 本位币行反算原币会让各行原币之和对不上用户输入的那个数，而外币余额正是逐行
 * 累加出来的，调汇会跟着错。
 *
 * 所以分摊要保证两条：
 * 1. 借方各行原币之和 = 原币总额；贷方同（借贷各自扫尾，不能混在一起扫）；
 * 2. 每行原币 × 汇率 ≈ 该行本位币（允许分位舍入差，那是折算固有的）。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { allocateForeignAmounts, type AllocatableLine } from "./foreign-allocation.js";

const RATE_718 = 7_180_000; // 1 USD = 7.18 CNY

function line(debit: number, credit: number): AllocatableLine {
  return { debitCents: debit, creditCents: credit };
}

test("单借单贷等额：原币原样落到两行", () => {
  // 1000 USD × 7.18 = 7180 CNY
  const result = allocateForeignAmounts(
    [line(7180_00, 0), line(0, 7180_00)],
    1000_00,
    RATE_718
  );
  assert.deepEqual(result, [1000_00, 1000_00]);
});

test("价税分离（借两行、贷一行）：借方两行之和等于原币总额", () => {
  // 1000 USD 含税，本位币 7180：不含税 6353.98 + 税额 826.02
  const result = allocateForeignAmounts(
    [line(6353_98, 0), line(826_02, 0), line(0, 7180_00)],
    1000_00,
    RATE_718
  );
  const debitSum = result[0]! + result[1]!;
  assert.equal(debitSum, 1000_00, "借方各行原币之和必须等于用户输入的原币总额");
  assert.equal(result[2], 1000_00, "贷方单行拿到全额");
});

test("除不尽时末行扫尾，借贷各自扫各自的", () => {
  // 三等分一个除不尽的金额
  const result = allocateForeignAmounts(
    [line(100_00, 0), line(100_00, 0), line(100_00, 0), line(0, 300_00)],
    100_00, // 原币总额 100.00，三行各 33.33 余 0.01
    3_000_000
  );
  const debitSum = result[0]! + result[1]! + result[2]!;
  assert.equal(debitSum, 100_00);
  assert.equal(result[3], 100_00, "贷方那行单独扫尾到全额");
  // 扫尾落在借方最后一行
  assert.equal(result[2]! - result[0]!, 1);
});

test("每行原币折算回本位币，偏差不超过「一分外币」对应的本位币", () => {
  // 偏差上界是汇率本身而不是 1 分：外币的最小单位是分，1 分 USD 对应 7.18 分 CNY，
  // 所以本位币的可表达粒度天然是 7.18 分的倍数。本位币各行金额由模板决定
  // （价税分离算出 6353.98 / 826.02），原币是按比例分摊的——两者不可能逐行严格
  // 互为倍数。这不是 bug，是两种粒度并存的必然结果。
  //
  // 写这条时我先按「不超过 1 分」断言，跑出来偏差 3 分才想明白这一点。
  const lines = [line(6353_98, 0), line(826_02, 0), line(0, 7180_00)];
  const result = allocateForeignAmounts(lines, 1000_00, RATE_718);
  const tolerance = Math.ceil(RATE_718 / 1_000_000);

  for (const [index, foreign] of result.entries()) {
    const baseOfLine = lines[index]!.debitCents + lines[index]!.creditCents;
    const converted = Math.round((foreign * RATE_718) / 1_000_000);
    assert.ok(
      Math.abs(converted - baseOfLine) <= tolerance,
      `第 ${index} 行折算回本位币偏差 ${Math.abs(converted - baseOfLine)} 分，超过容差 ${tolerance}：${converted} vs ${baseOfLine}`
    );
  }
});

test("单边为 0 的行不参与分摊——047 保证一行只有一侧非零", () => {
  const result = allocateForeignAmounts([line(500_00, 0), line(0, 500_00)], 100_00, 5_000_000);
  assert.deepEqual(result, [100_00, 100_00]);
});

test("本位币总额为 0 时不做除零，各行原币为 0", () => {
  // 理论上不该发生（凭证金额为 0 会被别处挡掉），但除零会产生 NaN 并静默
  // 写进库，比返回 0 危险得多
  const result = allocateForeignAmounts([line(0, 0), line(0, 0)], 100_00, RATE_718);
  assert.deepEqual(result, [0, 0]);
});
