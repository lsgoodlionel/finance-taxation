import test from "node:test";
import assert from "node:assert/strict";

import { VAT_ACCOUNT_ROLES } from "./vat-accounts.js";
import type { VatAccountMap, VatAccountRole } from "./vat-accounts.js";
import {
  buildNotApplicablePlan,
  buildVatSettlementPlan,
  resolveVatSettlementApplicability
} from "./vat-settlement.js";
import type { VatSettlementBasis, VatSettlementLine } from "./vat-settlement.js";

/**
 * 月末「结转未交增值税」的账务判定（V12-B8 / 蓝图 F4）。
 *
 * 这一步做不了的后果不是少一张凭证：资产负债表上「应交税费」会永远是销项与进项
 * 两个孤立数字的代数和，而不是「本月该缴多少」。所以本文件钉死的是**结果的形状**
 * ——哪种情形出凭证、出什么分录、哪种情形坚决不出。
 */

/** 编码取自 migrations/060，与生产 seed 一致；名称简写便于断言阅读。 */
const ACCOUNT_FIXTURE: Record<VatAccountRole, { code: string; name: string }> = {
  outputTax: { code: "222101", name: "应交税费-应交增值税（销项）" },
  inputTax: { code: "222102", name: "应交税费-应交增值税（进项）" },
  inputTaxTransferOut: { code: "222107", name: "应交税费-应交增值税（进项税额转出）" },
  taxPaid: { code: "222108", name: "应交税费-应交增值税（已交税金）" },
  transferUnpaid: { code: "222109", name: "应交税费-应交增值税（转出未交增值税）" },
  transferOverpaid: { code: "222110", name: "应交税费-应交增值税（转出多交增值税）" },
  unpaid: { code: "222111", name: "应交税费-未交增值税" },
  prepaid: { code: "222112", name: "应交税费-预交增值税" }
};

const ACCOUNTS: VatAccountMap = Object.fromEntries(
  (Object.keys(VAT_ACCOUNT_ROLES) as VatAccountRole[]).map((role) => [
    role,
    { role, ...ACCOUNT_FIXTURE[role] }
  ])
) as VatAccountMap;

const PERIOD = "2026-06";

function basis(overrides: Partial<VatSettlementBasis> = {}): VatSettlementBasis {
  return {
    columnNetCredit: 0,
    taxPaidInPeriod: 0,
    prepaidBalance: 0,
    ...overrides
  };
}

/** 断言分录借贷相等 —— 结转凭证要能过 checkPostable，不平就根本落不了库。 */
function assertBalanced(lines: readonly VatSettlementLine[]): void {
  const debit = lines.reduce((sum, line) => sum + Number(line.debit), 0);
  const credit = lines.reduce((sum, line) => sum + Number(line.credit), 0);
  assert.equal(debit.toFixed(2), credit.toFixed(2), "结转分录必须借贷平衡");
}

function findLine(lines: readonly VatSettlementLine[], code: string): VatSettlementLine {
  const found = lines.find((line) => line.accountCode === code);
  assert.ok(found, `分录中应包含科目 ${code}`);
  return found;
}

// ── 情形一：销项 > 进项 → 应缴，结转 ──────────────────────────────────

test("output tax above input tax transfers the payable into 未交增值税", () => {
  // 销项 1300 / 进项 300 → 专栏贷方净额 1000
  const plan = buildVatSettlementPlan(basis({ columnNetCredit: 1000 }), ACCOUNTS, PERIOD);

  assert.equal(plan.outcome, "payable");
  assert.equal(plan.payableAmount, "1000.00");
  assert.equal(plan.creditCarriedForward, "0.00");
  assert.equal(plan.lines.length, 2);
  assertBalanced(plan.lines);

  // 借 应交税费-应交增值税（转出未交增值税）
  const transfer = findLine(plan.lines, ACCOUNT_FIXTURE.transferUnpaid.code);
  assert.equal(transfer.debit, "1000.00");
  assert.equal(transfer.credit, "0.00");

  // 贷 应交税费-未交增值税
  const unpaid = findLine(plan.lines, ACCOUNT_FIXTURE.unpaid.code);
  assert.equal(unpaid.credit, "1000.00");
  assert.equal(unpaid.debit, "0.00");
});

test("input tax transferred out increases the payable", () => {
  // 销项 1000 / 进项 400 / 进项转出 100 → 1000 + 100 − 400 = 700
  const plan = buildVatSettlementPlan(basis({ columnNetCredit: 700 }), ACCOUNTS, PERIOD);
  assert.equal(plan.outcome, "payable");
  assert.equal(plan.payableAmount, "700.00");
});

// ── 情形二：进项 > 销项 → 留抵，坚决不结转 ────────────────────────────

test("input tax above output tax leaves the credit in place and produces no voucher", () => {
  // 销项 100 / 进项 300 → 专栏借方余额 200
  const plan = buildVatSettlementPlan(basis({ columnNetCredit: -200 }), ACCOUNTS, PERIOD);

  assert.equal(plan.outcome, "credit_carried");
  assert.equal(plan.creditCarriedForward, "200.00");
  assert.equal(plan.payableAmount, "0.00");
  assert.deepEqual(plan.lines, [], "留抵不是应收税款，不得结转进未交增值税");
});

test("carried-forward credit offsets the next period instead of being re-taxed", () => {
  // 上期留抵 200（仍挂在进项科目里），本期销项 500 → 累计净额 500 − 200 = 300
  const plan = buildVatSettlementPlan(basis({ columnNetCredit: 300 }), ACCOUNTS, PERIOD);
  assert.equal(plan.outcome, "payable");
  assert.equal(
    plan.payableAmount,
    "300.00",
    "累计口径才能让留抵跨月抵减；按本期发生额取数会让纳税人多缴 200"
  );
});

// ── 情形三：相等 → 不产生凭证 ────────────────────────────────────────

test("a net-zero VAT column produces no voucher at all", () => {
  const plan = buildVatSettlementPlan(basis({ columnNetCredit: 0 }), ACCOUNTS, PERIOD);
  assert.equal(plan.outcome, "balanced");
  assert.deepEqual(plan.lines, []);
});

test("sub-cent noise is treated as zero rather than producing a 0.00 voucher", () => {
  const plan = buildVatSettlementPlan(basis({ columnNetCredit: 0.0001 }), ACCOUNTS, PERIOD);
  assert.equal(plan.outcome, "balanced");
  assert.deepEqual(plan.lines, []);
});

// ── 已交税金：多交要转出，且不能把留抵当成多交 ────────────────────────

test("paying more than the period owes transfers 多交增值税 the other way round", () => {
  // 应纳 100，本月已缴 150 → 专栏借方余额 50，全部是多缴
  const plan = buildVatSettlementPlan(
    basis({ columnNetCredit: -50, taxPaidInPeriod: 150 }),
    ACCOUNTS,
    PERIOD
  );

  assert.equal(plan.outcome, "overpaid");
  assert.equal(plan.overpaidAmount, "50.00");
  assert.equal(plan.creditCarriedForward, "0.00");
  assertBalanced(plan.lines);

  // 借 未交增值税 / 贷 转出多交增值税 —— 与应缴时方向相反
  assert.equal(findLine(plan.lines, ACCOUNT_FIXTURE.unpaid.code).debit, "50.00");
  assert.equal(findLine(plan.lines, ACCOUNT_FIXTURE.transferOverpaid.code).credit, "50.00");
});

test("a debit balance made of both overpayment and carried credit is split, never transferred whole", () => {
  // 留抵 100 + 当月已缴 50 → 借方余额 150，但只有 50 是多缴
  const plan = buildVatSettlementPlan(
    basis({ columnNetCredit: -150, taxPaidInPeriod: 50 }),
    ACCOUNTS,
    PERIOD
  );

  assert.equal(plan.outcome, "overpaid");
  assert.equal(plan.overpaidAmount, "50.00", "多缴以本期已交税金封顶");
  assert.equal(plan.creditCarriedForward, "100.00", "留抵部分必须原样留在进项科目");
  assertBalanced(plan.lines);
  assert.equal(plan.lines.length, 2, "留抵不产生分录，只有多缴那一对");
});

test("prior-period tax payments are not mistaken for this period's overpayment", () => {
  // 已交税金为 0（往期缴的税早被往期结转轧掉）→ 借方余额全是留抵
  const plan = buildVatSettlementPlan(
    basis({ columnNetCredit: -150, taxPaidInPeriod: 0 }),
    ACCOUNTS,
    PERIOD
  );
  assert.equal(plan.outcome, "credit_carried");
  assert.deepEqual(plan.lines, []);
});

// ── 预交增值税：与专栏轧差各自平衡，并入同一张凭证 ────────────────────

test("prepaid VAT is transferred into 未交增值税 alongside the column settlement", () => {
  const plan = buildVatSettlementPlan(
    basis({ columnNetCredit: 1000, prepaidBalance: 300 }),
    ACCOUNTS,
    PERIOD
  );

  assert.equal(plan.outcome, "payable");
  assert.equal(plan.prepaidTransferred, "300.00");
  assert.equal(plan.lines.length, 4);
  assertBalanced(plan.lines);

  const prepaid = plan.lines.filter((line) => line.accountCode === ACCOUNT_FIXTURE.prepaid.code);
  assert.equal(prepaid.length, 1);
  assert.equal(prepaid[0]!.credit, "300.00");
});

test("prepaid VAT alone still produces a balanced voucher when the column nets to zero", () => {
  const plan = buildVatSettlementPlan(
    basis({ columnNetCredit: 0, prepaidBalance: 300 }),
    ACCOUNTS,
    PERIOD
  );
  assert.equal(plan.outcome, "balanced", "轧差本身仍是平的");
  assert.equal(plan.lines.length, 2, "但预缴该转的还得转");
  assertBalanced(plan.lines);
});

// ── 纳税人身份 ──────────────────────────────────────────────────────

test("small-scale taxpayers do not settle VAT at period end", () => {
  const verdict = resolveVatSettlementApplicability("small_scale");
  assert.equal(verdict.applicable, false);
  assert.match(verdict.reason, /小规模纳税人/);

  const plan = buildNotApplicablePlan(verdict.reason);
  assert.equal(plan.outcome, "not_applicable");
  assert.deepEqual(plan.lines, []);
});

test("general taxpayers under the simplified method do not settle either", () => {
  const verdict = resolveVatSettlementApplicability("general_simplified");
  assert.equal(verdict.applicable, false);
  assert.match(verdict.reason, /简易计税/);
});

test("general VAT taxpayers do settle", () => {
  assert.equal(resolveVatSettlementApplicability("general_vat").applicable, true);
});

test("legacy taxpayer_type values outside the union fall back to general VAT", () => {
  // migrations/015 里种的是 taxpayer_type = 'general'，不在 TaxpayerType 联合类型内。
  // rules.ts:resolveTaxRuleProfile 对它同样落到一般计税分支，这里保持一致。
  assert.equal(resolveVatSettlementApplicability("general").applicable, true);
});
