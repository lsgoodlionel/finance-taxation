import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDraftProposal, buildDraftProposalFromSuggestion } from "./draft-proposal.js";
import type { AccountingSuggestion } from "../accounting-agent.js";

function balancedSuggestion(overrides: Partial<AccountingSuggestion> = {}): AccountingSuggestion {
  return {
    templateKey: "sales",
    voucherType: "accrual",
    lines: [
      { id: "l1", summary: "确认应收账款", accountCode: "1122", accountName: "应收账款", debit: "100.00", credit: "0.00" },
      { id: "l2", summary: "确认主营业务收入", accountCode: "6001", accountName: "主营业务收入", debit: "0.00", credit: "100.00" }
    ],
    rationale: "销售类事项：确认应收账款与主营业务收入。",
    confidence: 0.95,
    needsReview: false,
    ...overrides
  };
}

// --- 真实链路（经由 suggestAccountingEntry）---

test("真实链路：已知类型 + 有金额 → 借贷平衡，但 accounting-agent 恒为 needsReview=true，强制 manual", () => {
  const proposal = buildDraftProposal({ id: "e1", type: "sales", title: "软件销售", amount: 100 });
  assert.equal(proposal.templateKey, "sales");
  assert.equal(proposal.balanced, true);
  assert.equal(proposal.sumDebitCents, 10000);
  assert.equal(proposal.sumCreditCents, 10000);
  // 当前 accounting-agent.ts 对匹配到模板的建议也无条件返回 needsReview: true，
  // 因此即便借贷平衡、置信度不低，仍必须强制人工——这正是 draft-then-approve 的安全默认值。
  assert.equal(proposal.level, "manual");
  assert.ok(proposal.blockingReasons.some((r) => r.includes("需人工复核")));
});

test("真实链路：未知类型 → 无分录 + needsReview，强制 manual", () => {
  const proposal = buildDraftProposal({ id: "e2", type: "general", title: "其他", amount: 100 });
  assert.equal(proposal.templateKey, null);
  assert.equal(proposal.lines.length, 0);
  assert.equal(proposal.balanced, true); // 0 === 0，视为平衡但不代表可自动
  assert.equal(proposal.level, "manual");
  assert.ok(proposal.blockingReasons.some((r) => r.includes("未产出任何分录")));
  assert.ok(proposal.blockingReasons.some((r) => r.includes("需人工复核")));
});

test("真实链路：金额缺失（null）→ 无分录，强制 manual", () => {
  const proposal = buildDraftProposal({ id: "e3", type: "procurement", title: "采购", amount: null });
  assert.equal(proposal.lines.length, 0);
  assert.equal(proposal.level, "manual");
  assert.ok(proposal.blockingReasons.length > 0);
});

test("真实链路：借贷合计正确性（两位小数金额，按分累加）", () => {
  const proposal = buildDraftProposal({ id: "e4", type: "expense", title: "差旅费", amount: 1234.56 });
  assert.equal(proposal.sumDebitCents, 123456);
  assert.equal(proposal.sumCreditCents, 123456);
  assert.equal(proposal.balanced, true);
});

// --- 纯计算分支（经由可注入 AccountingSuggestion 的测试入口，覆盖真实链路无法触达的分支）---

test("平衡 + 高置信 + needsReview=false → 不被强制降级，采纳 governance 的 suggest 分级", () => {
  const proposal = buildDraftProposalFromSuggestion(balancedSuggestion());
  assert.equal(proposal.balanced, true);
  assert.equal(proposal.blockingReasons.length, 0);
  // isFinancialMutation 恒为 true，governance 结构上不会对财务写账放行 "auto"，
  // 因此平衡 + 高置信度在本模块下的最佳可达结果是 "suggest"。
  assert.equal(proposal.level, "suggest");
});

test("借贷不平衡 → 无论置信度/governance 结果如何，强制 manual", () => {
  const unbalanced = balancedSuggestion({
    lines: [
      { id: "l1", summary: "确认应收账款", accountCode: "1122", accountName: "应收账款", debit: "100.00", credit: "0.00" },
      { id: "l2", summary: "确认主营业务收入", accountCode: "6001", accountName: "主营业务收入", debit: "0.00", credit: "90.00" }
    ]
  });
  const proposal = buildDraftProposalFromSuggestion(unbalanced);
  assert.equal(proposal.balanced, false);
  assert.equal(proposal.sumDebitCents, 10000);
  assert.equal(proposal.sumCreditCents, 9000);
  assert.equal(proposal.level, "manual");
  assert.ok(proposal.blockingReasons.some((r) => r.includes("不平衡")));
});

test("分录金额格式非法 → 视为不可信，强制 manual（不静默当 0 处理）", () => {
  const malformed = balancedSuggestion({
    lines: [
      { id: "l1", summary: "确认应收账款", accountCode: "1122", accountName: "应收账款", debit: "not-a-number", credit: "0.00" },
      { id: "l2", summary: "确认主营业务收入", accountCode: "6001", accountName: "主营业务收入", debit: "0.00", credit: "100.00" }
    ]
  });
  const proposal = buildDraftProposalFromSuggestion(malformed);
  assert.equal(proposal.balanced, false);
  assert.equal(proposal.level, "manual");
  assert.ok(proposal.blockingReasons.some((r) => r.includes("格式非法")));
});

test("分录为空 → 强制 manual", () => {
  const empty = balancedSuggestion({ lines: [], templateKey: null });
  const proposal = buildDraftProposalFromSuggestion(empty);
  assert.equal(proposal.level, "manual");
  assert.ok(proposal.blockingReasons.some((r) => r.includes("未产出任何分录")));
});

test("needsReview=true → 即使平衡也强制 manual", () => {
  const needsReview = balancedSuggestion({ needsReview: true });
  const proposal = buildDraftProposalFromSuggestion(needsReview);
  assert.equal(proposal.balanced, true);
  assert.equal(proposal.level, "manual");
  assert.ok(proposal.blockingReasons.some((r) => r.includes("需人工复核")));
});

test("低置信度 + 平衡 + needsReview=false → 未触发强制降级时，仍遵循 governance 的 manual 判断", () => {
  const lowConfidence = balancedSuggestion({ confidence: 0.1 });
  const proposal = buildDraftProposalFromSuggestion(lowConfidence);
  assert.equal(proposal.blockingReasons.length, 0);
  assert.equal(proposal.level, "manual");
});

test("自定义阈值透传给 governance：suggestMin 提高后，同样置信度降级为 manual", () => {
  const proposal = buildDraftProposalFromSuggestion(balancedSuggestion({ confidence: 0.7 }), {
    autoThresholds: { suggestMin: 0.9 }
  });
  assert.equal(proposal.blockingReasons.length, 0);
  assert.equal(proposal.level, "manual");
});

test("本函数不入账：返回值只包含草稿数据，不含任何写库/过账副作用标记", () => {
  const proposal = buildDraftProposal({ id: "e5", type: "sales", title: "软件销售", amount: 100 });
  const keys = Object.keys(proposal).sort();
  assert.deepEqual(keys, [
    "balanced",
    "blockingReasons",
    "level",
    "lines",
    "rationale",
    "sumCreditCents",
    "sumDebitCents",
    "templateKey"
  ]);
});
