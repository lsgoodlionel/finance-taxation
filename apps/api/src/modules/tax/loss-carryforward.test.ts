import assert from "node:assert/strict";
import test from "node:test";
import { applyLossCarryforward, resolveCarryforwardYears } from "./loss-carryforward.js";

/**
 * 弥补以前年度亏损（V17 阶段三批次 C）。
 *
 * ## 缺陷
 *
 * 批次 A 把本期亏损带出来了（不再被 `Math.max(x, 0)` 抹平），但系统里
 * **没有以前年度亏损的台账**——只知道「今年亏了多少」，不知道
 * 「前几年还剩多少可以补」。于是盈利年度的应纳税所得额一分不减，
 * 企业按全额缴税，而法律给的弥补权利用不上。
 *
 * ## 政策
 *
 * - 结转年限：一般企业 5 年（企业所得税法第十八条）；
 *   高新技术企业、科技型中小企业 10 年（财税〔2018〕76 号）
 * - 顺序：**先亏先补**
 * - 弥补后的余额才是应纳税所得额
 *
 * 政策依据见 `docs/v17-tax-rate-policy/POLICY-MAP-CIT-SURTAX.md` 第 2.3 节。
 */

/** 一条台账：某年度亏了多少、已经补了多少。 */
function loss(year: number, lossCents: number, offsetCents = 0) {
  return { lossYear: year, lossCents, offsetCents };
}

test("先亏先补：早的年度先用完", () => {
  const result = applyLossCarryforward({
    taxableIncomeCents: 1_000_000_00, // 100 万利润
    currentYear: 2026,
    losses: [loss(2024, 300_000_00), loss(2023, 400_000_00)],
    carryforwardYears: 5
  });

  assert.equal(result.offsetCents, 700_000_00, "两年的亏损全部用上");
  assert.equal(result.remainingIncomeCents, 300_000_00, "100 万 - 70 万 = 30 万");

  // **顺序要对**：2023 年的先补完，再补 2024 年的。
  // 顺序错了在总额相同时看不出来，但一旦有亏损超期就会差出真金白银——
  // 早年的先超期，留着不用等于白白作废。
  assert.deepEqual(
    result.applied.map((item) => item.lossYear),
    [2023, 2024],
    "按亏损年度从早到晚弥补"
  );
});

test("利润不够补完时，只补到 0，剩下的继续结转", () => {
  const result = applyLossCarryforward({
    taxableIncomeCents: 500_000_00, // 50 万利润
    currentYear: 2026,
    losses: [loss(2023, 400_000_00), loss(2024, 300_000_00)],
    carryforwardYears: 5
  });

  assert.equal(result.offsetCents, 500_000_00, "最多补到应纳税所得额为 0");
  assert.equal(result.remainingIncomeCents, 0, "不能补成负数——弥补不产生新的亏损");
  assert.equal(
    result.applied.find((item) => item.lossYear === 2024)?.appliedCents,
    100_000_00,
    "2023 年的 40 万补完，2024 年的只补 10 万"
  );
});

test("超过结转年限的亏损不能再补", () => {
  // 2020 年的亏损，一般企业结转 5 年，到 2025 年为止。2026 年不能再补。
  const result = applyLossCarryforward({
    taxableIncomeCents: 1_000_000_00,
    currentYear: 2026,
    losses: [loss(2020, 500_000_00), loss(2023, 200_000_00)],
    carryforwardYears: 5
  });

  assert.equal(result.offsetCents, 200_000_00, "只有 2023 年那笔能补");
  assert.equal(
    result.expired.some((item) => item.lossYear === 2020),
    true,
    "超期的要单独列出来——用户得知道有一笔权利作废了，而不是悄悄消失"
  );
});

test("结转年限的边界：第 5 年还能补，第 6 年不能", () => {
  // 2021 年亏损，5 年结转 = 2022..2026 都能补。
  const inWindow = applyLossCarryforward({
    taxableIncomeCents: 1_000_000_00,
    currentYear: 2026,
    losses: [loss(2021, 100_000_00)],
    carryforwardYears: 5
  });
  assert.equal(inWindow.offsetCents, 100_000_00, "第 5 年还在窗口内");

  const outOfWindow = applyLossCarryforward({
    taxableIncomeCents: 1_000_000_00,
    currentYear: 2027,
    losses: [loss(2021, 100_000_00)],
    carryforwardYears: 5
  });
  assert.equal(outOfWindow.offsetCents, 0, "第 6 年超期");
});

test("已经补过一部分的亏损，只能补剩下的", () => {
  const result = applyLossCarryforward({
    taxableIncomeCents: 1_000_000_00,
    currentYear: 2026,
    losses: [loss(2023, 400_000_00, 250_000_00)], // 亏 40 万，已补 25 万
    carryforwardYears: 5
  });

  assert.equal(result.offsetCents, 150_000_00, "只剩 15 万可补");
});

test("亏损年度不弥补——本期就是亏的，没有所得可以补", () => {
  const result = applyLossCarryforward({
    taxableIncomeCents: -200_000_00,
    currentYear: 2026,
    losses: [loss(2023, 400_000_00)],
    carryforwardYears: 5
  });

  assert.equal(result.offsetCents, 0, "亏损年度不动用以前年度的亏损额度");
  assert.equal(
    result.remainingIncomeCents,
    -200_000_00,
    "本期亏损原样带出——它本身要成为新的一条台账"
  );
});

test("高新技术企业结转 10 年", () => {
  assert.equal(resolveCarryforwardYears({ isHighTech: false }), 5, "一般企业 5 年");
  assert.equal(
    resolveCarryforwardYears({ isHighTech: true }),
    10,
    "高新技术企业、科技型中小企业 10 年（财税〔2018〕76 号）"
  );

  // 同一笔 2018 年的亏损，一般企业到 2023 年止，高新到 2028 年止。
  const general = applyLossCarryforward({
    taxableIncomeCents: 1_000_000_00,
    currentYear: 2026,
    losses: [loss(2018, 100_000_00)],
    carryforwardYears: 5
  });
  assert.equal(general.offsetCents, 0, "一般企业已超期");

  const highTech = applyLossCarryforward({
    taxableIncomeCents: 1_000_000_00,
    currentYear: 2026,
    losses: [loss(2018, 100_000_00)],
    carryforwardYears: 10
  });
  assert.equal(highTech.offsetCents, 100_000_00, "高新还在 10 年窗口内");
});
