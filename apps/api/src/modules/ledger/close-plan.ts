/**
 * AI 月结向导 — 编排大脑（纯核心）。
 *
 * 把月末结账从静态 checklist（见 modules/close/close.routes.ts 的数据库聚合视图）
 * 升级为一条有序的步骤状态机：给定某属期已收集到的事实，纯函数式地推导每一步
 * 的状态与是否可推进。遵循 draft-then-approve：每一步先产出草稿/核对结果，
 * 人工批准后才能标记为完成，完成后才解锁下一步。
 *
 * 本模块不读写数据库、不触网；调用方负责收集 ClosePlanInput（例如从
 * closing.ts / close-period.ts / tax-integration/consistency.ts 的运行结果映射而来）
 * 并把这里派生出的 UI 状态渲染给用户。
 */

/** 结账步骤，固定顺序；前一步未完成，后一步即为 blocked。 */
export type CloseStepKey =
  | "sweep_unposted"
  | "depreciation"
  | "accrual_review"
  | "tax_consistency"
  | "close_income"
  | "snapshot"
  | "filing_draft"
  | "archive";

/** 步骤的固定顺序，供 UI 渲染或遍历使用。 */
export const CLOSE_STEP_ORDER: readonly CloseStepKey[] = [
  "sweep_unposted",
  "depreciation",
  "accrual_review",
  "tax_consistency",
  "close_income",
  "snapshot",
  "filing_draft",
  "archive"
];

/**
 * blocked   — 前置步骤未完成，暂不可操作。
 * ready     — 前置步骤已完成，可以执行本步（生成草稿/执行动作）。
 * in_review — 已产出草稿或核对结果，需人工确认/批准后才能推进。
 * done      — 已批准完成，解锁下一步。
 */
export type CloseStepStatus = "blocked" | "ready" | "in_review" | "done";

export type TaxConsistencyOverall = "ok" | "warning" | "alert";

export interface ClosePlanInput {
  /** 属期内尚未生成凭证入账的事项数（银行流水待认领、发票草稿等）。 */
  unpostedEventCount: number;
  /** 本期折旧计提凭证是否已过账。 */
  depreciationPosted: boolean;
  /** 权责发生制调整（应计/预提）待人工审阅批准的草稿数。 */
  pendingDraftCount: number;
  /** 票税一致性核对结果（tax-integration/consistency.ts 的 overall）；尚未运行核对为 null。 */
  taxConsistencyOverall: TaxConsistencyOverall | null;
  /** 人工是否已确认/处理票税差异，允许在非 ok 的情况下继续推进。 */
  taxConsistencyAcknowledged: boolean;
  /** 结转损益凭证是否已生成过账（close-period.ts 的结果）。 */
  incomeClosed: boolean;
  /** 期末财务报表快照是否已生成。 */
  snapshotTaken: boolean;
  /** 申报底稿是否已生成待归档。 */
  filingDraftReady: boolean;
  /** 属期是否已归档锁账。 */
  archived: boolean;
}

export interface CloseStep {
  key: CloseStepKey;
  label: string;
  status: CloseStepStatus;
  /** 处于 blocked 或 in_review 时，说明原因；ready/done 时省略。 */
  blockingReason?: string;
}

export interface ClosePlan {
  steps: CloseStep[];
  /** 用户接下来应处理的步骤；全部完成时为 null。 */
  nextActionableStep: CloseStepKey | null;
  overall: "not_started" | "in_progress" | "blocked" | "completed";
}

interface StepResolution {
  done: boolean;
  /** done 为 false 时，本步自身（忽略前置条件）应处于的状态。 */
  pendingStatus: "ready" | "in_review";
  /** pendingStatus 为 in_review 时的说明。 */
  reason?: string;
}

interface StepDefinition {
  key: CloseStepKey;
  label: string;
  resolve: (input: ClosePlanInput) => StepResolution;
}

function resolveSweepUnposted(input: ClosePlanInput): StepResolution {
  return { done: input.unpostedEventCount <= 0, pendingStatus: "ready" };
}

function resolveDepreciation(input: ClosePlanInput): StepResolution {
  return { done: input.depreciationPosted, pendingStatus: "ready" };
}

function resolveAccrualReview(input: ClosePlanInput): StepResolution {
  const done = input.pendingDraftCount <= 0;
  if (done) {
    return { done, pendingStatus: "ready" };
  }
  return {
    done,
    pendingStatus: "in_review",
    reason: `还有 ${input.pendingDraftCount} 条权责发生制调整草稿待审阅批准`
  };
}

function resolveTaxConsistency(input: ClosePlanInput): StepResolution {
  if (input.taxConsistencyOverall === null) {
    return { done: false, pendingStatus: "ready" };
  }
  if (input.taxConsistencyOverall === "ok" || input.taxConsistencyAcknowledged) {
    return { done: true, pendingStatus: "ready" };
  }
  const severityLabel = input.taxConsistencyOverall === "alert" ? "alert 级" : "warning 级";
  return {
    done: false,
    pendingStatus: "in_review",
    reason: `票税一致性核对存在${severityLabel}差异，需人工确认后才能推进`
  };
}

function resolveCloseIncome(input: ClosePlanInput): StepResolution {
  return { done: input.incomeClosed, pendingStatus: "ready" };
}

function resolveSnapshot(input: ClosePlanInput): StepResolution {
  return { done: input.snapshotTaken, pendingStatus: "ready" };
}

function resolveFilingDraft(input: ClosePlanInput): StepResolution {
  return { done: input.filingDraftReady, pendingStatus: "ready" };
}

function resolveArchive(input: ClosePlanInput): StepResolution {
  return { done: input.archived, pendingStatus: "ready" };
}

const STEP_DEFINITIONS: readonly StepDefinition[] = [
  { key: "sweep_unposted", label: "清理未过账事项", resolve: resolveSweepUnposted },
  { key: "depreciation", label: "计提折旧", resolve: resolveDepreciation },
  { key: "accrual_review", label: "权责发生制调整复核", resolve: resolveAccrualReview },
  { key: "tax_consistency", label: "票税一致性核对", resolve: resolveTaxConsistency },
  { key: "close_income", label: "结转损益", resolve: resolveCloseIncome },
  { key: "snapshot", label: "生成期末财务快照", resolve: resolveSnapshot },
  { key: "filing_draft", label: "生成申报底稿", resolve: resolveFilingDraft },
  { key: "archive", label: "归档锁账", resolve: resolveArchive }
];

function computeOverall(steps: readonly CloseStep[]): ClosePlan["overall"] {
  if (steps.every((step) => step.status === "done")) {
    return "completed";
  }
  const firstNotDone = steps.find((step) => step.status !== "done");
  if (firstNotDone?.status === "in_review") {
    return "blocked";
  }
  const anyDone = steps.some((step) => step.status === "done");
  return anyDone ? "in_progress" : "not_started";
}

/**
 * 纯函数：给定属期事实，派生结账向导每一步的状态。
 * 前一步未 done，后一步恒为 blocked；票税 alert/warning 未被人工确认时，
 * tax_consistency 停在 in_review，不会自动 done。
 */
export function buildClosePlan(input: ClosePlanInput): ClosePlan {
  const steps: CloseStep[] = [];
  let previousDone = true;

  for (const definition of STEP_DEFINITIONS) {
    const resolution = definition.resolve(input);
    let status: CloseStepStatus;
    let blockingReason: string | undefined;

    if (!previousDone) {
      status = "blocked";
      const previousLabel = steps[steps.length - 1]?.label ?? "上一步";
      blockingReason = `需先完成上一步「${previousLabel}」`;
    } else if (resolution.done) {
      status = "done";
    } else {
      status = resolution.pendingStatus;
      blockingReason = resolution.reason;
    }

    steps.push({ key: definition.key, label: definition.label, status, blockingReason });
    previousDone = previousDone && resolution.done;
  }

  const firstNotDone = steps.find((step) => step.status !== "done") ?? null;

  return {
    steps,
    nextActionableStep: firstNotDone ? firstNotDone.key : null,
    overall: computeOverall(steps)
  };
}
