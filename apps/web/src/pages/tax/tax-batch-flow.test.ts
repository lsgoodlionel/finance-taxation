import { collectRelatedObjects } from "../../lib/object-flow";
import { buildBatchItemLinks, buildTaxBatchFlow, buildTaxBatchFlowTitle } from "./tax-batch-flow";
import type { TaxBatchDetail } from "./taxTypes";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function makeItem(id: string, status: "pending" | "review_required" | "ready" = "ready") {
  return {
    id,
    companyId: "c1",
    businessEventId: `evt-${id}`,
    mappingId: "map-1",
    taxType: "增值税",
    treatment: "销项计税",
    basis: "含税收入",
    filingPeriod: "2026-05",
    status,
    source: "analysis" as const,
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z"
  };
}

function makeDetail(overrides: Partial<TaxBatchDetail> = {}): TaxBatchDetail {
  return {
    id: "tax-batch-1",
    companyId: "c1",
    taxType: "增值税",
    filingPeriod: "2026-05",
    status: "ready",
    itemIds: ["tax-item-1"],
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    items: [makeItem("tax-item-1")],
    reviews: [],
    archives: [],
    ...overrides
  };
}

function statusOf(flow: ReturnType<typeof buildTaxBatchFlow>, key: string): string {
  assert(flow, "expected a flow");
  const step = flow.steps.find((item) => item.key === key);
  assert(step, `expected step ${key}`);
  return step.status;
}

// ── 没选批次：不画空条，交给页面出提示 ──────────────────────────────────────
assert(buildTaxBatchFlow(null) === null, "expected null flow without a batch");
assert(buildTaxBatchFlowTitle(null) === "这个批次办到哪了", "expected fallback title");
assert(
  buildTaxBatchFlowTitle(makeDetail()).includes("增值税 2026-05"),
  "expected title to carry the batch identity"
);

// ── 四步固定顺序：校验 → 提交 → 复核 → 留档 ───────────────────────────────
const ready = buildTaxBatchFlow(makeDetail());
assert(ready, "expected flow for ready batch");
assert(
  ready.steps.map((step) => step.key).join(",") === "validate,submit,review,archive",
  `expected the batch lifecycle order, got ${ready.steps.map((step) => step.key).join(",")}`
);
// ready = 后端认定批次内事项全部就绪 → 校验已过，当前落在提交
assert(statusOf(ready, "validate") === "done", "expected ready batch to have passed validation");
assert(statusOf(ready, "submit") === "current", "expected submit to be the current step");
assert(statusOf(ready, "review") === "pending", "expected later steps to stay pending");
assert(ready.nextStepKey === "submit", "expected next actionable step to be submit");
assert(ready.overall === "in_progress", "expected an in-progress batch");

// ── 草稿/待复核：卡在校验，且要说清在等什么 ─────────────────────────────────
const draft = buildTaxBatchFlow(makeDetail({ status: "draft" }));
assert(statusOf(draft, "validate") === "blocked", "expected draft batch blocked at validation");
assert(draft?.overall === "blocked", "expected overall blocked");
assert(
  draft?.steps[0]?.hint?.includes("草稿") === true,
  `expected a draft hint, got ${draft?.steps[0]?.hint}`
);

const needsItems = buildTaxBatchFlow(makeDetail({ status: "review_required" }));
assert(
  needsItems?.steps[0]?.hint?.includes("没准备好的税务事项") === true,
  "expected the blocking reason to point at the unready items"
);

// ── 本次校验结论有否决权（未提交时）：issues 原样交给用户 ────────────────────
const failed = buildTaxBatchFlow(makeDetail(), {
  valid: false,
  issues: ["批次中存在不同税种事项", "批次中存在未 ready 的税务事项"],
  itemCount: 2
});
assert(statusOf(failed, "validate") === "blocked", "expected failed validation to block");
assert(
  failed?.steps[0]?.hint === "批次中存在不同税种事项；批次中存在未 ready 的税务事项",
  `expected issues joined into the hint, got ${failed?.steps[0]?.hint}`
);
assert(
  buildTaxBatchFlow(makeDetail(), { valid: false, issues: [], itemCount: 0 })?.steps[0]?.hint ===
    "校验未通过",
  "expected a fallback hint when the API returns no issue text"
);

// 校验通过的结论不该反过来把已就绪的批次拖回 blocked
assert(
  statusOf(buildTaxBatchFlow(makeDetail(), { valid: true, issues: [], itemCount: 1 }), "validate") === "done",
  "expected a passing validation to keep validation done"
);

// 已提交的批次即使带着过期的失败校验，也不该显示成「卡在校验」
const submittedWithStaleValidation = buildTaxBatchFlow(makeDetail({ status: "submitted" }), {
  valid: false,
  issues: ["批次内没有税务事项"],
  itemCount: 0
});
assert(
  statusOf(submittedWithStaleValidation, "validate") === "done",
  "expected submitted batch to keep validation done despite stale failure"
);
assert(statusOf(submittedWithStaleValidation, "submit") === "done", "expected submit done");
assert(statusOf(submittedWithStaleValidation, "review") === "current", "expected review to be current");

// ── 复核：只有 approved 才算办完，rejected 要把原因讲出来 ────────────────────
const rejected = buildTaxBatchFlow(
  makeDetail({
    status: "submitted",
    reviews: [
      {
        id: "rev-2",
        companyId: "c1",
        batchId: "tax-batch-1",
        reviewedByUserId: "u1",
        reviewedByName: "王复核",
        reviewResult: "rejected",
        reviewNotes: "进项税额对不上",
        reviewedAt: "2026-06-02T00:00:00.000Z"
      }
    ]
  })
);
assert(statusOf(rejected, "review") === "blocked", "expected a rejected review to block the flow");
assert(
  rejected?.steps[2]?.hint === "上一次复核没通过：进项税额对不上",
  `expected the rejection notes surfaced, got ${rejected?.steps[2]?.hint}`
);

const approved = buildTaxBatchFlow(
  makeDetail({
    status: "submitted",
    reviews: [
      {
        id: "rev-1",
        companyId: "c1",
        batchId: "tax-batch-1",
        reviewedByUserId: "u1",
        reviewedByName: "王复核",
        reviewResult: "approved",
        reviewNotes: "",
        reviewedAt: "2026-06-01T00:00:00.000Z"
      }
    ]
  })
);
assert(statusOf(approved, "review") === "done", "expected an approved review to complete the step");
assert(statusOf(approved, "archive") === "current", "expected archive to become current");

// ── 全流程走完：整体 done，不再催用户动手 ───────────────────────────────────
const archived = buildTaxBatchFlow(
  makeDetail({
    status: "archived",
    reviews: [
      {
        id: "rev-1",
        companyId: "c1",
        batchId: "tax-batch-1",
        reviewedByUserId: "u1",
        reviewedByName: "王复核",
        reviewResult: "approved",
        reviewNotes: "",
        reviewedAt: "2026-06-01T00:00:00.000Z"
      }
    ],
    archives: [
      {
        id: "arc-1",
        companyId: "c1",
        batchId: "tax-batch-1",
        archivedByUserId: "u1",
        archivedByName: "王复核",
        archiveLabel: "2026-05 增值税",
        archiveNotes: "",
        archivedAt: "2026-06-03T00:00:00.000Z"
      }
    ]
  })
);
assert(archived?.overall === "done", "expected a fully archived batch to be done");
assert(archived?.nextStepKey === null, "expected no next step once archived");

// ── 关联对象：批次内的税务事项可跳转，且有上限不撑爆流程条 ───────────────────
const manyItems = makeDetail({
  items: Array.from({ length: 9 }, (_, index) => makeItem(`tax-item-${index + 1}`))
});
// 关联面板拿全量（用户要顺藤摸瓜查完）
assert(buildBatchItemLinks(manyItems).length === 9, "expected all items for the related objects panel");
assert(
  buildBatchItemLinks(manyItems).every((link) => link.kind === "tax_item"),
  "expected tax item links"
);
// 流程条只挂前几条（一行细排步骤不能被链接撑成一堵墙）
const relatedFlow = buildTaxBatchFlow(manyItems);
assert(relatedFlow, "expected flow");
assert(
  collectRelatedObjects(relatedFlow).length === 6,
  "expected the flow rail to cap its inline links"
);

// 每一步都写明由谁来办，用户才知道该不该自己动手
assert(
  ready.steps.every((step) => typeof step.owner === "string" && step.owner.length > 0),
  "expected every step to declare an owner"
);

console.log("tax-batch-flow-ok");
