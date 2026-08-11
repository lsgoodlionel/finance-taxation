import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDisposalLines,
  CLEARING_ACCOUNT_CODE,
  DISPOSAL_GAIN_ACCOUNT_CODE
} from "./disposal.js";

const base = {
  assetAccountCode: "1601",
  accumulatedAccountCode: "1602",
  originalCostCents: 100_000_00,
  accumulatedCents: 60_000_00,
  proceedsCents: null as number | null,
  proceedsAccountCode: null as string | null
};

function totals(lines: ReturnType<typeof buildDisposalLines>) {
  return lines.reduce(
    (sum, line) => ({
      debit: sum.debit + line.debitCents,
      credit: sum.credit + line.creditCents
    }),
    { debit: 0, credit: 0 }
  );
}

function amountOn(lines: ReturnType<typeof buildDisposalLines>, code: string) {
  return lines
    .filter((line) => line.accountCode === code)
    .reduce(
      (sum, line) => ({ debit: sum.debit + line.debitCents, credit: sum.credit + line.creditCents }),
      { debit: 0, credit: 0 }
    );
}

test("未收到价款时净值挂在固定资产清理借方", () => {
  const lines = buildDisposalLines(base);

  assert.deepEqual(amountOn(lines, "1602"), { debit: 60_000_00, credit: 0 }, "累计折旧借方冲销");
  assert.deepEqual(amountOn(lines, "1601"), { debit: 0, credit: 100_000_00 }, "原值贷方销账");
  assert.deepEqual(
    amountOn(lines, CLEARING_ACCOUNT_CODE),
    { debit: 40_000_00, credit: 0 },
    "净值 4 万挂 1606 借方等待后续处置"
  );
  assert.equal(
    amountOn(lines, DISPOSAL_GAIN_ACCOUNT_CODE).debit + amountOn(lines, DISPOSAL_GAIN_ACCOUNT_CODE).credit,
    0,
    "价款未定时不得先认损益"
  );

  const { debit, credit } = totals(lines);
  assert.equal(debit, credit, "借贷必须平");
});

test("处置收益：价款高于净值，差额贷记 6115", () => {
  // 净值 40000，卖了 50000 → 收益 10000
  const lines = buildDisposalLines({
    ...base,
    proceedsCents: 50_000_00,
    proceedsAccountCode: "1002"
  });

  assert.deepEqual(amountOn(lines, "1002"), { debit: 50_000_00, credit: 0 }, "银行存款收款");
  assert.deepEqual(
    amountOn(lines, DISPOSAL_GAIN_ACCOUNT_CODE),
    { debit: 0, credit: 10_000_00 },
    "收益贷记资产处置损益"
  );

  const clearing = amountOn(lines, CLEARING_ACCOUNT_CODE);
  assert.equal(clearing.debit, clearing.credit, "清理科目当期结平");

  const { debit, credit } = totals(lines);
  assert.equal(debit, credit);
});

test("处置损失：价款低于净值，差额借记 6115", () => {
  // 净值 40000，只卖了 15000 → 损失 25000
  const lines = buildDisposalLines({
    ...base,
    proceedsCents: 15_000_00,
    proceedsAccountCode: "1002"
  });

  assert.deepEqual(
    amountOn(lines, DISPOSAL_GAIN_ACCOUNT_CODE),
    { debit: 25_000_00, credit: 0 },
    "损失借记资产处置损益"
  );

  const clearing = amountOn(lines, CLEARING_ACCOUNT_CODE);
  assert.equal(clearing.debit, clearing.credit, "清理科目当期结平");

  const { debit, credit } = totals(lines);
  assert.equal(debit, credit);
});

test("无偿报废：价款为 0，净值全额转为处置损失", () => {
  const lines = buildDisposalLines({ ...base, proceedsCents: 0, proceedsAccountCode: "1002" });

  assert.deepEqual(
    amountOn(lines, DISPOSAL_GAIN_ACCOUNT_CODE),
    { debit: 40_000_00, credit: 0 },
    "净值全额计入损失"
  );
  // 价款为 0 时不该凭空生成一条 0 元的银行存款分录
  assert.equal(amountOn(lines, "1002").debit, 0);
  assert.equal(totals(lines).debit, totals(lines).credit);
});

test("已提足折旧的资产处置：净值为 0，不生成 1606 分录", () => {
  const lines = buildDisposalLines({
    ...base,
    accumulatedCents: 100_000_00,
    proceedsCents: 0,
    proceedsAccountCode: "1002"
  });

  const clearing = amountOn(lines, CLEARING_ACCOUNT_CODE);
  assert.equal(clearing.debit, 0);
  assert.equal(clearing.credit, 0);
  assert.equal(totals(lines).debit, totals(lines).credit);
});

test("已提足折旧但仍卖出价款：全额确认为处置收益", () => {
  const lines = buildDisposalLines({
    ...base,
    accumulatedCents: 100_000_00,
    proceedsCents: 3_000_00,
    proceedsAccountCode: "1002"
  });

  assert.deepEqual(amountOn(lines, DISPOSAL_GAIN_ACCOUNT_CODE), { debit: 0, credit: 3_000_00 });
  assert.equal(totals(lines).debit, totals(lines).credit);
});

test("尚未计提任何折旧就处置：全部原值进清理", () => {
  const lines = buildDisposalLines({ ...base, accumulatedCents: 0 });

  assert.equal(amountOn(lines, "1602").debit, 0, "没提过折旧就不该有累计折旧分录");
  assert.deepEqual(amountOn(lines, CLEARING_ACCOUNT_CODE), { debit: 100_000_00, credit: 0 });
  assert.equal(totals(lines).debit, totals(lines).credit);
});

test("借贷平衡在各种价款下都成立", () => {
  for (const proceeds of [0, 1, 39_999_99, 40_000_00, 40_000_01, 999_999_99]) {
    const lines = buildDisposalLines({
      ...base,
      proceedsCents: proceeds,
      proceedsAccountCode: "1002"
    });
    const { debit, credit } = totals(lines);
    assert.equal(debit, credit, `价款 ${proceeds} 时借贷不平`);
  }
});
