import { test } from "node:test";
import assert from "node:assert/strict";
import { buildClosePlan, CLOSE_STEP_ORDER, type ClosePlan, type CloseStepKey, type ClosePlanInput } from "./close-plan.js";

// Baseline: nothing done yet, but the period does have unswept events —
// this is the realistic "start of month-end close" state.
const initial: ClosePlanInput = {
  unpostedEventCount: 3,
  depreciationPosted: false,
  pendingDraftCount: 0,
  taxConsistencyOverall: null,
  taxConsistencyAcknowledged: false,
  incomeClosed: false,
  snapshotTaken: false,
  filingDraftReady: false,
  archived: false
};

function statusOf(plan: ClosePlan, key: CloseStepKey) {
  return plan.steps.find((s) => s.key === key)?.status;
}

test("all steps exist once, in the fixed order", () => {
  const plan = buildClosePlan(initial);
  assert.deepEqual(
    plan.steps.map((s) => s.key),
    CLOSE_STEP_ORDER
  );
});

test("empty/initial state: first step is ready, every later step is blocked", () => {
  const plan = buildClosePlan(initial);
  assert.equal(statusOf(plan, "sweep_unposted"), "ready");
  for (const key of CLOSE_STEP_ORDER.slice(1)) {
    assert.equal(statusOf(plan, key), "blocked", `${key} should be blocked`);
  }
  const depreciation = plan.steps.find((s) => s.key === "depreciation")!;
  assert.match(depreciation.blockingReason ?? "", /清理未过账事项/);
  assert.equal(plan.nextActionableStep, "sweep_unposted");
  assert.equal(plan.overall, "not_started");
});

test("completing a step unblocks and readies the next one", () => {
  const plan = buildClosePlan({ ...initial, unpostedEventCount: 0 });
  assert.equal(statusOf(plan, "sweep_unposted"), "done");
  assert.equal(statusOf(plan, "depreciation"), "ready");
  assert.equal(statusOf(plan, "accrual_review"), "blocked");
  assert.equal(plan.nextActionableStep, "depreciation");
  assert.equal(plan.overall, "in_progress");
});

test("accrual review stays in_review while drafts are pending, blocking tax_consistency", () => {
  const plan = buildClosePlan({
    ...initial,
    unpostedEventCount: 0,
    depreciationPosted: true,
    pendingDraftCount: 2
  });
  assert.equal(statusOf(plan, "accrual_review"), "in_review");
  assert.match(
    plan.steps.find((s) => s.key === "accrual_review")!.blockingReason ?? "",
    /2 条权责发生制调整草稿/
  );
  assert.equal(statusOf(plan, "tax_consistency"), "blocked");
  assert.equal(plan.nextActionableStep, "accrual_review");
  assert.equal(plan.overall, "blocked");
});

test("tax consistency ok auto-completes and readies close_income", () => {
  const plan = buildClosePlan({
    ...initial,
    unpostedEventCount: 0,
    depreciationPosted: true,
    pendingDraftCount: 0,
    taxConsistencyOverall: "ok"
  });
  assert.equal(statusOf(plan, "tax_consistency"), "done");
  assert.equal(statusOf(plan, "close_income"), "ready");
  assert.equal(plan.nextActionableStep, "close_income");
});

test("tax consistency alert is stuck in_review and does not auto-complete", () => {
  const plan = buildClosePlan({
    ...initial,
    unpostedEventCount: 0,
    depreciationPosted: true,
    pendingDraftCount: 0,
    taxConsistencyOverall: "alert",
    taxConsistencyAcknowledged: false
  });
  const taxStep = plan.steps.find((s) => s.key === "tax_consistency")!;
  assert.equal(taxStep.status, "in_review");
  assert.match(taxStep.blockingReason ?? "", /alert 级差异/);
  assert.equal(statusOf(plan, "close_income"), "blocked");
  assert.equal(plan.nextActionableStep, "tax_consistency");
  assert.equal(plan.overall, "blocked");
});

test("acknowledging a tax consistency alert lets the step complete and unlocks close_income", () => {
  const plan = buildClosePlan({
    ...initial,
    unpostedEventCount: 0,
    depreciationPosted: true,
    pendingDraftCount: 0,
    taxConsistencyOverall: "alert",
    taxConsistencyAcknowledged: true
  });
  assert.equal(statusOf(plan, "tax_consistency"), "done");
  assert.equal(statusOf(plan, "close_income"), "ready");
  assert.equal(plan.overall, "in_progress");
});

test("a warning severity also requires acknowledgement before completing", () => {
  const stuck = buildClosePlan({
    ...initial,
    unpostedEventCount: 0,
    depreciationPosted: true,
    pendingDraftCount: 0,
    taxConsistencyOverall: "warning",
    taxConsistencyAcknowledged: false
  });
  assert.equal(statusOf(stuck, "tax_consistency"), "in_review");

  const acknowledged = buildClosePlan({
    ...initial,
    unpostedEventCount: 0,
    depreciationPosted: true,
    pendingDraftCount: 0,
    taxConsistencyOverall: "warning",
    taxConsistencyAcknowledged: true
  });
  assert.equal(statusOf(acknowledged, "tax_consistency"), "done");
});

test("everything completed: all steps done, no next action, overall completed", () => {
  const plan = buildClosePlan({
    unpostedEventCount: 0,
    depreciationPosted: true,
    pendingDraftCount: 0,
    taxConsistencyOverall: "ok",
    taxConsistencyAcknowledged: false,
    incomeClosed: true,
    snapshotTaken: true,
    filingDraftReady: true,
    archived: true
  });
  assert.equal(plan.steps.every((s) => s.status === "done"), true);
  assert.equal(plan.nextActionableStep, null);
  assert.equal(plan.overall, "completed");
});

test("archive remains blocked until every prior step, including filing_draft, is done", () => {
  const plan = buildClosePlan({
    unpostedEventCount: 0,
    depreciationPosted: true,
    pendingDraftCount: 0,
    taxConsistencyOverall: "ok",
    taxConsistencyAcknowledged: false,
    incomeClosed: true,
    snapshotTaken: true,
    filingDraftReady: false,
    archived: false
  });
  assert.equal(statusOf(plan, "filing_draft"), "ready");
  assert.equal(statusOf(plan, "archive"), "blocked");
  assert.equal(plan.nextActionableStep, "filing_draft");
});
