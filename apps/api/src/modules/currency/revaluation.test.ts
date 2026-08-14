/**
 * 外币折算与期末调汇（V12-D5）。
 *
 * 法规依据：《企业会计准则第 19 号——外币折算》
 * - 第十一条：外币货币性项目，采用**资产负债表日即期汇率**折算，因汇率变动产生的
 *   汇兑差额计入当期损益；
 * - 第十二条：以历史成本计量的**非货币性项目**，仍采用交易发生日的即期汇率折算，
 *   不改变其记账本位币金额——所以调汇范围只含货币性项目，这是准则要求而非简化。
 *
 * 方向是本模块最容易错的地方，两类科目正好相反，各有用例钉住。
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  convertToBaseCents,
  revalueMonetaryItem,
  type RevaluationInput
} from "./revaluation.js";

/** 汇率用「1 外币 = N 本位币」，保留 6 位小数以整数存储（乘 1_000_000）。 */
const RATE_USD_700 = 7_000_000; // 1 USD = 7.00 CNY
const RATE_USD_720 = 7_200_000; // 1 USD = 7.20 CNY
const RATE_USD_680 = 6_800_000; // 1 USD = 6.80 CNY

test("折算：外币金额 × 汇率，四舍五入到分", () => {
  // 1000.00 USD × 7.00 = 7000.00 CNY
  assert.equal(convertToBaseCents(1000_00, RATE_USD_700), 7000_00);
  // 除不尽时四舍五入到分，不留浮点尾巴
  assert.equal(convertToBaseCents(333_33, 3_333_333), Math.round((333_33 * 3_333_333) / 1_000_000));
  assert.equal(Number.isInteger(convertToBaseCents(1_00, 1_234_567)), true);
});

test("折算：汇率为 1 时原样返回——本位币业务不该被折算逻辑碰", () => {
  assert.equal(convertToBaseCents(12_345_67, 1_000_000), 12_345_67);
});

function input(overrides: Partial<RevaluationInput>): RevaluationInput {
  return {
    accountCode: "1002",
    accountName: "银行存款-美元户",
    category: "asset",
    currency: "USD",
    foreignBalanceCents: 1000_00,
    baseBookBalanceCents: 7000_00,
    closingRate: RATE_USD_700,
    ...overrides
  };
}

test("资产类外币升值 → 本位币价值增加，借记资产、汇兑收益", () => {
  // 1000 USD 账面 7000 CNY，期末 7.20 → 应为 7200 CNY，差 +200
  const result = revalueMonetaryItem(input({ closingRate: RATE_USD_720 }));

  assert.equal(result.differenceCents, 200_00);
  assert.equal(result.accountSide, "debit", "资产增加记借方");
  assert.equal(result.gainLossSide, "credit", "对手方是汇兑收益，记贷方");
  assert.equal(result.isGain, true);
});

test("资产类外币贬值 → 汇兑损失，方向整个反过来", () => {
  // 期末 6.80 → 应为 6800 CNY，差 −200
  const result = revalueMonetaryItem(input({ closingRate: RATE_USD_680 }));

  assert.equal(result.differenceCents, -200_00);
  assert.equal(result.accountSide, "credit", "资产减少记贷方");
  assert.equal(result.gainLossSide, "debit", "汇兑损失记借方");
  assert.equal(result.isGain, false);
});

test("负债类的方向与资产类相反——同一个汇率变动，损益正好掉个个儿", () => {
  // 应付账款 1000 USD，账面 7000 CNY。外币升值到 7.20：
  // 要还的本位币变多了 → 负债增加（贷方）、汇兑**损失**（借方）
  const liability = revalueMonetaryItem(
    input({
      accountCode: "2202",
      accountName: "应付账款-美元",
      category: "liability",
      closingRate: RATE_USD_720
    })
  );

  assert.equal(liability.differenceCents, 200_00, "本位币金额同样增加 200");
  assert.equal(liability.accountSide, "credit", "负债增加记贷方");
  assert.equal(liability.gainLossSide, "debit", "对企业是损失");
  assert.equal(liability.isGain, false, "同样是外币升值，资产是收益、负债是损失");
});

test("负债类外币贬值是收益", () => {
  const liability = revalueMonetaryItem(
    input({
      accountCode: "2202",
      category: "liability",
      closingRate: RATE_USD_680
    })
  );
  assert.equal(liability.isGain, true, "要还的钱变少了");
  assert.equal(liability.accountSide, "debit");
  assert.equal(liability.gainLossSide, "credit");
});

test("汇率没变则差额为 0，且明确标出「无需调整」——不生成金额为 0 的分录", () => {
  const result = revalueMonetaryItem(input({}));
  assert.equal(result.differenceCents, 0);
  assert.equal(result.needsAdjustment, false);
});

test("外币余额为 0 时不调汇，哪怕账面本位币余额不为 0", () => {
  // 这种情况本身是账务异常（外币清零了本位币还挂着钱），但调汇不是修它的地方：
  // 按期末汇率折算 0 外币得 0，硬调会把那笔挂账金额全额转进汇兑损益，
  // 把一个记账错误伪装成汇率波动。
  const result = revalueMonetaryItem(
    input({ foreignBalanceCents: 0, baseBookBalanceCents: 123_45 })
  );
  assert.equal(result.needsAdjustment, false);
  assert.equal(result.differenceCents, 0);
  assert.match(result.reason, /外币余额为 0/);
});

test("本位币科目不参与调汇", () => {
  const result = revalueMonetaryItem(
    input({ currency: "CNY", closingRate: 1_000_000, baseBookBalanceCents: 1000_00 })
  );
  assert.equal(result.needsAdjustment, false);
  assert.match(result.reason, /本位币/);
});

test("非货币性项目不参与调汇——这是准则要求，不是简化", () => {
  // 预付账款按历史汇率计量，期末不调（准则 19 号第十二条）
  const result = revalueMonetaryItem(
    input({ accountCode: "1123", category: "asset", isMonetary: false, closingRate: RATE_USD_720 })
  );
  assert.equal(result.needsAdjustment, false);
  assert.match(result.reason, /非货币性/);
});
