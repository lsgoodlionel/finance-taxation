import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLedgerVatPaper,
  reconcilePapers,
  signedAmountFor,
  type LedgerEntryForVat
} from "./vat-ledger-paper.js";

function entry(
  overrides: Partial<LedgerEntryForVat> & Pick<LedgerEntryForVat, "entryId" | "role">
): LedgerEntryForVat {
  return {
    voucherId: `vch-${overrides.entryId}`,
    entryDate: "2026-06-15",
    summary: "测试分录",
    accountCode: "222101",
    accountName: "销项税额",
    debitCents: 0,
    creditCents: 0,
    ...overrides
  };
}

test("销项取贷方、进项取借方，均以正数汇总", () => {
  const paper = buildLedgerVatPaper("2026-06", [
    entry({ entryId: "e1", role: "output", creditCents: 130_00 }),
    entry({ entryId: "e2", role: "input", debitCents: 39_00, accountCode: "222102" })
  ]);

  assert.equal(paper.outputTaxCents, 130_00);
  assert.equal(paper.inputTaxCents, 39_00);
  assert.equal(paper.payableCents, 91_00);
});

test("红冲走反方向，取净额而不是单侧", () => {
  const paper = buildLedgerVatPaper("2026-06", [
    entry({ entryId: "e1", role: "output", creditCents: 130_00 }),
    // 红冲：销项记在借方
    entry({ entryId: "e2", role: "output", debitCents: 130_00 })
  ]);

  assert.equal(
    paper.outputTaxCents,
    0,
    "只取贷方的话，红冲等于没发生，底稿会比账簿多出一笔已经冲掉的税"
  );
  assert.equal(paper.lines.length, 2, "两条分录都是真实发生过的记账动作，明细里都该看得见");
});

test("进项税额转出增加应纳税额", () => {
  const paper = buildLedgerVatPaper("2026-06", [
    entry({ entryId: "e1", role: "output", creditCents: 100_00 }),
    entry({ entryId: "e2", role: "input", debitCents: 60_00 }),
    // 已抵扣的进项被冲回，本月应缴随之增加
    entry({ entryId: "e3", role: "inputTransferOut", creditCents: 20_00 })
  ]);

  assert.equal(paper.inputTransferOutCents, 20_00);
  assert.equal(paper.payableCents, 60_00, "100 − 60 + 20");
});

test("已交税金不减应纳税额——申报表上是两行", () => {
  const paper = buildLedgerVatPaper("2026-06", [
    entry({ entryId: "e1", role: "output", creditCents: 100_00 }),
    entry({ entryId: "e2", role: "taxPaid", debitCents: 100_00 })
  ]);

  assert.equal(paper.taxPaidCents, 100_00, "已缴税额单独列示");
  assert.equal(
    paper.payableCents,
    100_00,
    "应纳税额仍是 100——已经缴掉的钱不是应纳税额的减项，二者轧差是月末结转的事"
  );
});

test("简易计税并入应纳税额", () => {
  const paper = buildLedgerVatPaper("2026-06", [
    entry({ entryId: "e1", role: "simplified", creditCents: 30_00, accountCode: "222115" })
  ]);
  assert.equal(paper.simplifiedCents, 30_00);
  assert.equal(paper.payableCents, 30_00);
});

test("非增值税科目的分录既不计入也不列示", () => {
  const paper = buildLedgerVatPaper("2026-06", [
    entry({ entryId: "e1", role: "output", creditCents: 100_00 }),
    entry({ entryId: "e2", role: "other", creditCents: 999_00, accountCode: "1002" })
  ]);
  assert.equal(paper.payableCents, 100_00);
  assert.equal(paper.lines.length, 1);
});

test("signedAmountFor 对每个角色取正确方向", () => {
  assert.equal(signedAmountFor(entry({ entryId: "a", role: "output", creditCents: 100 })), 100);
  assert.equal(signedAmountFor(entry({ entryId: "b", role: "output", debitCents: 100 })), -100);
  assert.equal(signedAmountFor(entry({ entryId: "c", role: "input", debitCents: 100 })), 100);
  assert.equal(signedAmountFor(entry({ entryId: "d", role: "input", creditCents: 100 })), -100);
  assert.equal(signedAmountFor(entry({ entryId: "e", role: "other", creditCents: 100 })), 0);
});

test("空账期给出全零而不是报错", () => {
  const paper = buildLedgerVatPaper("2026-06", []);
  assert.equal(paper.payableCents, 0);
  assert.deepEqual(paper.lines, []);
});

test("两个口径一致时明确说一致", () => {
  const result = reconcilePapers(91_00, 91_00);
  assert.equal(result.consistent, true);
  assert.match(result.message, /一致/);
});

test("账簿多于税目：记了账没录税目，申报会少报", () => {
  const result = reconcilePapers(100_00, 60_00);
  assert.equal(result.consistent, false);
  assert.equal(result.differenceCents, 40_00);
  assert.match(result.message, /记了账但没有对应的税目记录/);
  assert.match(result.message, /申报时会少报/);
  assert.match(result.message, /不会自动抹平/);
});

test("税目多于账簿：录了税目没记账，账面少记负债", () => {
  const result = reconcilePapers(60_00, 100_00);
  assert.equal(result.differenceCents, -40_00);
  assert.match(result.message, /录了税目但没有入账/);
  assert.match(result.message, /账面少记了这笔负债/);
});
