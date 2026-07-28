import type { VoucherStatus } from "@finance-taxation/domain-model";
import { collectRelatedObjects } from "../../lib/object-flow";
import { NEXT_ACTION_LABELS, resolveNextAction } from "./voucher-actions";
import {
  buildVoucherFlow,
  buildVoucherFlowTitle,
  buildVoucherNextStep,
  buildVoucherReportPeriod,
  type VoucherFlowSource,
  type VoucherValidationResult
} from "./voucher-flow";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function makeVoucher(overrides: Partial<VoucherFlowSource> = {}): VoucherFlowSource {
  return {
    id: "voucher-000012ab",
    businessEventId: "evt-001",
    status: "draft",
    createdAt: "2026-05-08T02:00:00.000Z",
    approvedAt: null,
    postedAt: null,
    ...overrides
  };
}

function makeValidation(valid: boolean, issues: string[] = []): VoucherValidationResult {
  return { valid, totals: { debit: "1000.00", credit: valid ? "1000.00" : "800.00" }, issues };
}

function stepStatus(flow: ReturnType<typeof buildVoucherFlow>, key: string) {
  return flow?.steps.find((step) => step.key === key)?.status ?? null;
}

// ── 没有选中凭证时不画空条 ────────────────────────────────────────────────────

assert(buildVoucherFlow(null) === null, "expected no flow without a voucher");
assert(buildVoucherNextStep(null) === null, "expected no next step without a voucher");
assert(buildVoucherFlowTitle(null) === "这张凭证办到哪了", "expected a generic title without a voucher");
assert(buildVoucherFlowTitle(makeVoucher()).includes("000012AB"), "expected the title to name the voucher");

// ── 五步顺序：起草 → 校验 → 审核 → 过账 → 进报表 ──────────────────────────────

const draftFlow = buildVoucherFlow(makeVoucher());
assert(draftFlow, "expected a flow for a draft voucher");
assert(
  draftFlow.steps.map((step) => step.key).join(",") === "draft,validate,approve,post,report",
  "expected the documented five-step voucher flow"
);

// ── 每一步的状态来自凭证真实字段 ─────────────────────────────────────────────

assert(stepStatus(draftFlow, "draft") === "done", "expected an existing voucher to count as drafted");
assert(stepStatus(draftFlow, "validate") === "current", "expected a fresh draft to sit on the validation step");
assert(stepStatus(draftFlow, "approve") === "pending", "expected later steps to stay pending");
assert(draftFlow.overall === "in_progress", "expected a draft voucher to be in progress");

// 校验失败：当前这步是 blocked，并把具体问题说出来
const failedFlow = buildVoucherFlow(makeVoucher(), makeValidation(false, ["借方合计 1000.00 与贷方合计 800.00 不等"]));
assert(stepStatus(failedFlow, "validate") === "blocked", "expected a failed validation to block the step");
assert(
  failedFlow?.steps.find((step) => step.key === "validate")?.hint?.includes("800.00") === true,
  "expected the blocked step to carry the real validation issue"
);
assert(failedFlow?.overall === "blocked", "expected the whole flow to read as blocked");

// 校验通过：推进到审核
const validatedFlow = buildVoucherFlow(makeVoucher(), makeValidation(true));
assert(stepStatus(validatedFlow, "validate") === "done", "expected a passing validation to finish the step");
assert(stepStatus(validatedFlow, "approve") === "current", "expected the flow to move on to approval");

// 已审核（review_required）：校验与审核都算完成，当前停在过账
const approvedFlow = buildVoucherFlow(
  makeVoucher({ status: "review_required" as VoucherStatus, approvedAt: "2026-05-09T02:00:00.000Z" })
);
assert(stepStatus(approvedFlow, "validate") === "done", "expected an approved voucher to have passed validation");
assert(stepStatus(approvedFlow, "approve") === "done", "expected approval to be done");
assert(stepStatus(approvedFlow, "post") === "current", "expected an approved voucher to await posting");

// 已审核的凭证不该被一张过期的校验结果拽回「卡住」——那张结果属于改动之前
const staleValidationFlow = buildVoucherFlow(
  makeVoucher({ status: "review_required" as VoucherStatus }),
  makeValidation(false, ["借贷不平"])
);
assert(
  stepStatus(staleValidationFlow, "validate") === "done",
  "expected an approved voucher to ignore a stale failing validation"
);

// 已过账：全流程走完，包括「进报表」
const postedFlow = buildVoucherFlow(
  makeVoucher({
    status: "posted" as VoucherStatus,
    approvedAt: "2026-05-09T02:00:00.000Z",
    postedAt: "2026-05-10T02:00:00.000Z"
  })
);
assert(postedFlow?.overall === "done", "expected a posted voucher to be fully done");
assert(stepStatus(postedFlow, "report") === "done", "expected posting to carry the voucher into the period report");
assert(postedFlow?.nextStepKey === null, "expected no next step for a posted voucher");

// ── 关联对象：来源事项可跳；报表那一步不造假链接 ──────────────────────────────

const related = collectRelatedObjects(draftFlow);
assert(related.length === 1, "expected exactly one linked object on the voucher flow");
assert(
  related[0]?.kind === "business_event" && related[0]?.id === "evt-001",
  "expected the source business event to be linkable"
);
assert(
  draftFlow.steps.find((step) => step.key === "report")?.related === undefined,
  "expected the report step to carry no object link: ReportSnapshot has no field pointing back at a voucher"
);

// 没有来源事项时不硬造链接
const orphanFlow = buildVoucherFlow(makeVoucher({ businessEventId: "" }));
assert(collectRelatedObjects(orphanFlow!).length === 0, "expected no link when there is no source event");

// ── 下一步：与 resolveNextAction（快捷键 a）同一份判定 ────────────────────────

const STATUSES: VoucherStatus[] = ["draft", "review_required", "posted"];
for (const status of STATUSES) {
  const nextStep = buildVoucherNextStep(makeVoucher({ status }));
  const action = resolveNextAction(status);
  assert(nextStep, `expected a next step for status ${status}`);
  assert(
    nextStep.label === NEXT_ACTION_LABELS[action],
    `expected the button label for ${status} to come from resolveNextAction, not a second state machine`
  );
  assert(
    nextStep.done === (action === "none"),
    `expected the done flag for ${status} to follow resolveNextAction`
  );
}

// ── 报表期间：以过账日为准，未过账时用制单日预估 ─────────────────────────────

assert(buildVoucherReportPeriod(makeVoucher()) === "2026-05", "expected the draft period to come from createdAt");
assert(
  buildVoucherReportPeriod(makeVoucher({ postedAt: "2026-06-01T00:00:00.000Z" })) === "2026-06",
  "expected the posted period to win over the created period"
);
assert(buildVoucherReportPeriod(null) === null, "expected no period without a voucher");
assert(
  buildVoucherReportPeriod(makeVoucher({ createdAt: "", postedAt: null })) === null,
  "expected no period when the timestamps are unusable"
);

console.log("voucher-flow-ok");
