import type { PayrollRecord, PayrollTaxReviewLedger, Task, TaxFilingBatch, TaxItem, Voucher } from "@finance-taxation/domain-model";
import type { TaxBatchDetail } from "../../pages/tax/taxTypes";
import type { PayrollTransferBatch } from "../../lib/api";

export type RuntimeExecutionState = "waiting" | "running" | "succeeded" | "failed" | "cancelled";
export type RuntimeAuthorizationState = "not_required" | "awaiting_authorization" | "authorized" | "insufficient";

export interface RuntimeStat {
  label: string;
  value: string;
}

export interface WorkflowRuntimeAction {
  key: string;
  label: string;
  tone?: "primary" | "default" | "danger";
  params?: Record<string, string>;
}

export interface WorkflowRuntimeIssue {
  tone: "info" | "warning" | "error";
  title: string;
  message: string;
  detail?: string;
}

export interface WorkflowRuntimeSummary {
  executionState: RuntimeExecutionState;
  executionLabel: string;
  executionMessage: string;
  authorizationState: RuntimeAuthorizationState;
  authorizationLabel: string;
  authorizationMessage: string;
  stats: RuntimeStat[];
  issue?: WorkflowRuntimeIssue;
  actions?: WorkflowRuntimeAction[];
}

function hasAnyRole(roleIds: string[], expected: string[]) {
  return expected.some((item) => roleIds.includes(item));
}

function canFinallyAuthorize(roleIds: string[]) {
  return hasAnyRole(roleIds, ["role-chairman", "role-finance-director"]);
}

function canReview(roleIds: string[]) {
  return canFinallyAuthorize(roleIds) || hasAnyRole(roleIds, ["role-accountant", "role-tax-specialist"]);
}

export function deriveTaskRuntimeSummary(tasks: Task[], roleIds: string[]): WorkflowRuntimeSummary {
  const blocked = tasks.filter((item) => item.status === "blocked").length;
  const running = tasks.filter((item) => item.status === "in_progress" || item.status === "in_review").length;
  const waiting = tasks.filter((item) => item.status === "not_started").length;
  const done = tasks.filter((item) => item.status === "done").length;

  let executionState: RuntimeExecutionState = "waiting";
  let executionLabel = "等待执行";
  let executionMessage = "当前任务还未开始，系统正等待补资料、指派或人工启动。";

  if (blocked > 0) {
    executionState = "failed";
    executionLabel = "存在阻塞";
    executionMessage = "当前任务链中存在阻塞项，需先解除异常或补齐资料后再继续推进。";
  } else if (running > 0) {
    executionState = "running";
    executionLabel = "执行中";
    executionMessage = "任务正在执行或复核中，系统会继续等待下一步处理结果。";
  } else if (tasks.length > 0 && done === tasks.length) {
    executionState = "succeeded";
    executionLabel = "已完成";
    executionMessage = "当前任务链已完成，可转入凭证、税务或归档结果复核。";
  }

  const awaitingReview = tasks.some((item) => item.status === "in_review");
  const authorizationState: RuntimeAuthorizationState = awaitingReview
    ? canReview(roleIds) ? "authorized" : "awaiting_authorization"
    : "not_required";

  const authorizationLabel =
    authorizationState === "authorized"
      ? "你可执行复核"
      : authorizationState === "awaiting_authorization"
        ? "等待有权复核人"
        : "当前无需授权";

  const authorizationMessage =
    authorizationState === "authorized"
      ? "当前身份具备复核推进条件，可直接处理处于复核中的任务。"
      : authorizationState === "awaiting_authorization"
        ? "当前任务已进入复核节点，但本账号不具备最终复核权限。"
        : "当前任务仍处于收集或执行阶段，暂未进入单独授权节点。";

  const blockedTask = tasks.find((item) => item.status === "blocked") ?? null;
  return {
    executionState,
    executionLabel,
    executionMessage,
    authorizationState,
    authorizationLabel,
    authorizationMessage,
    stats: [
      { label: "待开始", value: String(waiting) },
      { label: "进行中/复核中", value: String(running) },
      { label: "已阻塞", value: String(blocked) }
    ],
    issue: blockedTask
      ? {
          tone: "error",
          title: `阻塞任务：${blockedTask.title}`,
          message: blockedTask.description || "任务链已被阻塞，需先解除异常或补齐资料。",
          detail: "可先将阻塞任务重开，再回到事项或单据补资料。"
        }
      : undefined,
    actions: blockedTask
      ? [{ key: "retry-blocked-task", label: "重开阻塞任务", tone: "danger", params: { taskId: blockedTask.id } }]
      : []
  };
}

export function deriveTaxRuntimeSummary(
  items: TaxItem[],
  batches: TaxFilingBatch[],
  selectedBatchDetail: TaxBatchDetail | null,
  profiles: Array<{ status: "active" | "inactive" }>,
  roleIds: string[]
): WorkflowRuntimeSummary {
  const activeProfiles = profiles.filter((item) => item.status === "active").length;
  const readyItems = items.filter((item) => item.status === "ready").length;
  const reviewItems = items.filter((item) => item.status === "review_required").length;
  const submittedBatches = batches.filter((item) => item.status === "submitted").length;
  const archivedBatches = batches.filter((item) => item.status === "archived").length;
  const currentStatus = selectedBatchDetail?.status ?? null;
  let executionState: RuntimeExecutionState = "waiting";
  let executionLabel = "等待税务准备";
  let executionMessage = "先确认纳税人口径、税率规则和税务事项，再进入批次复核与申报。";

  if (currentStatus === "archived") {
    executionState = "succeeded";
    executionLabel = "已留档完成";
    executionMessage = "当前批次已完成复核、申报与归档，后续可直接打印或追溯留痕。";
  } else if (reviewItems > 0) {
    executionState = "failed";
    executionLabel = "待复核修正";
    executionMessage = "存在待复核税务事项，申报批次不应直接进入提交。";
  } else if (currentStatus === "submitted" || submittedBatches > 0 || readyItems > 0) {
    executionState = "running";
    executionLabel = "申报处理中";
    executionMessage = "税务事项已形成批次，正在复核、提交或等待归档。";
  }

  let authorizationState: RuntimeAuthorizationState = "not_required";
  let authorizationLabel = "当前无需授权";
  let authorizationMessage = "当前还未进入需要最终授权的申报提交节点。";

  if (currentStatus === "ready" || currentStatus === "submitted") {
    if (canFinallyAuthorize(roleIds) || hasAnyRole(roleIds, ["role-tax-specialist"])) {
      authorizationState = "authorized";
      authorizationLabel = "你可推进申报";
      authorizationMessage = "当前身份可继续完成申报提交、复核或留档动作。";
    } else {
      authorizationState = "awaiting_authorization";
      authorizationLabel = "等待税务/财务授权";
      authorizationMessage = "当前批次已到提交节点，但本账号不具备推进申报的授权。";
    }
  } else if (activeProfiles === 0) {
    authorizationState = "insufficient";
    authorizationLabel = "口径未建立";
    authorizationMessage = "尚未建立有效纳税人口径，税率规则和批次状态都不能稳定推进。";
  }

  const reviewItem = items.find((item) => item.status === "review_required") ?? null;

  return {
    executionState,
    executionLabel,
    executionMessage,
    authorizationState,
    authorizationLabel,
    authorizationMessage,
    stats: [
      { label: "有效口径", value: String(activeProfiles) },
      { label: "待复核事项", value: String(reviewItems) },
      { label: "已归档批次", value: String(archivedBatches) }
    ],
    issue:
      activeProfiles === 0
        ? {
            tone: "warning",
            title: "纳税人口径未建立",
            message: "当前没有有效纳税人口径，税率规则与申报批次不能稳定推进。",
            detail: "请先建立有效纳税人身份，再重试底稿与申报动作。"
          }
        : reviewItems > 0 || currentStatus === "review_required"
          ? {
              tone: "error",
              title: "税务批次待复核修正",
              message: reviewItem?.treatment || "存在待复核税务事项，当前批次不应直接提交。",
              detail: selectedBatchDetail?.id
                ? `建议先对批次 ${selectedBatchDetail.id} 重新复核，再继续提交或归档。`
                : "建议先回到批次复核，再继续提交或归档。"
            }
          : undefined,
    actions:
      reviewItems > 0 || currentStatus === "review_required"
        ? selectedBatchDetail
          ? [{ key: "retry-tax-review", label: "重新复核批次", tone: "danger", params: { batchId: selectedBatchDetail.id } }]
          : []
        : []
  };
}

export function deriveVoucherRuntimeSummary(vouchers: Voucher[], detail: Voucher | null, roleIds: string[]): WorkflowRuntimeSummary {
  const draft = vouchers.filter((item) => item.status === "draft").length;
  const reviewRequired = vouchers.filter((item) => item.status === "review_required").length;
  const posted = vouchers.filter((item) => item.status === "posted").length;

  let executionState: RuntimeExecutionState = "waiting";
  let executionLabel = "等待制单";
  let executionMessage = "凭证尚未形成完整审核链，系统仍停留在草稿或待校验阶段。";

  if (reviewRequired > 0) {
    executionState = "running";
    executionLabel = "待审核过账";
    executionMessage = "凭证已进入审核准备阶段，下一步应完成复核并过账入总账。";
  } else if (detail?.status === "posted" || (vouchers.length > 0 && posted === vouchers.length)) {
    executionState = "succeeded";
    executionLabel = "已过账";
    executionMessage = "当前凭证链已进入总账，后续重点转为报表和税务一致性复核。";
  }

  const needsAuthorization = detail?.status === "review_required";
  const authorizationState: RuntimeAuthorizationState = needsAuthorization
    ? canReview(roleIds) ? "authorized" : "awaiting_authorization"
    : "not_required";

  const authorizationLabel =
    authorizationState === "authorized"
      ? "你可审核过账"
      : authorizationState === "awaiting_authorization"
        ? "等待审核权限"
        : "当前无需授权";
  const authorizationMessage =
    authorizationState === "authorized"
      ? "当前身份可继续执行凭证审核与后续过账。"
      : authorizationState === "awaiting_authorization"
        ? "当前凭证已进入审核节点，但本账号不具备对应审核权限。"
        : "当前凭证仍处于草稿或已过账状态，暂无单独授权要求。";

  const invalidDetail = detail
    ? (() => {
        const debit = detail.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
        const credit = detail.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
        if (!detail.lines.length) {
          return { title: "凭证分录为空", detail: "请先补充分录后重新校验。" };
        }
        if (Math.abs(debit - credit) > 0.0001) {
          return { title: "借贷不平", detail: `当前借方 ${debit.toFixed(2)}，贷方 ${credit.toFixed(2)}，需先调整再继续审核过账。` };
        }
        if (detail.lines.some((line) => !line.accountCode || !line.accountName)) {
          return { title: "存在未填写完整科目的分录", detail: "请先补齐会计科目后重新校验。" };
        }
        return null;
      })()
    : null;

  return {
    executionState,
    executionLabel,
    executionMessage,
    authorizationState,
    authorizationLabel,
    authorizationMessage,
    stats: [
      { label: "草稿", value: String(draft) },
      { label: "待审核", value: String(reviewRequired) },
      { label: "已过账", value: String(posted) }
    ],
    issue: invalidDetail
      ? {
          tone: "error",
          title: invalidDetail.title,
          message: "当前凭证仍存在校验问题，不能直接进入审核/过账。",
          detail: invalidDetail.detail
        }
      : undefined,
    actions:
      invalidDetail && detail
        ? [{ key: "retry-voucher-validate", label: "重新校验凭证", tone: "danger", params: { voucherId: detail.id } }]
        : []
  };
}

export function derivePayrollRuntimeSummary(
  selectedPeriod: string,
  payrollRecords: PayrollRecord[],
  linkedEventId: string | null,
  reviewLedgers: PayrollTaxReviewLedger[],
  linkedRiskCount: number,
  roleIds: string[]
): WorkflowRuntimeSummary {
  const confirmed = payrollRecords.filter((item) => item.status === "confirmed").length;
  const draft = payrollRecords.filter((item) => item.status === "draft").length;
  const reviewedLedgers = reviewLedgers.filter((item) => item.status === "reviewed").length;
  const pendingLedgers = reviewLedgers.filter((item) => item.status !== "reviewed").length;

  let executionState: RuntimeExecutionState = "waiting";
  let executionLabel = "等待工资运行";
  let executionMessage = "请先生成工资记录，再进入事项、税务与凭证联动。";

  if (linkedRiskCount > 0) {
    executionState = "failed";
    executionLabel = "存在风险待处理";
    executionMessage = "工资事项已经识别出风险，需先处理个税、社保或凭证异常后再继续。";
  } else if (selectedPeriod && payrollRecords.length > 0 && draft === 0 && linkedEventId && pendingLedgers === 0) {
    executionState = "succeeded";
    executionLabel = "工资闭环完成";
    executionMessage = "当前工资期间已完成确认、事项生成和税务复核，可进入代发与留档。";
  } else if (selectedPeriod && (payrollRecords.length > 0 || linkedEventId)) {
    executionState = "running";
    executionLabel = "工资处理中";
    executionMessage = "工资记录、事项生成和税务复核正在推进，仍需关注确认与联动结果。";
  }

  let authorizationState: RuntimeAuthorizationState = "not_required";
  let authorizationLabel = "当前无需授权";
  let authorizationMessage = "当前还未进入需要最终确认的工资复核节点。";

  if (selectedPeriod && payrollRecords.length > 0 && draft === 0 && pendingLedgers > 0) {
    if (canReview(roleIds)) {
      authorizationState = "authorized";
      authorizationLabel = "你可完成复核";
      authorizationMessage = "工资记录已确认，当前身份可继续处理个税、社保和公积金复核。";
    } else {
      authorizationState = "awaiting_authorization";
      authorizationLabel = "等待复核授权";
      authorizationMessage = "工资已进入复核阶段，但本账号不具备对应复核权限。";
    }
  }

  return {
    executionState,
    executionLabel,
    executionMessage,
    authorizationState,
    authorizationLabel,
    authorizationMessage,
    stats: [
      { label: "已确认工资", value: String(confirmed) },
      { label: "待复核台账", value: String(pendingLedgers) },
      { label: "风险项", value: String(linkedRiskCount) }
    ]
  };
}

export function derivePayrollTransferRuntimeSummary(
  batches: PayrollTransferBatch[],
  selectedBatch: PayrollTransferBatch | null,
  roleIds: string[]
): WorkflowRuntimeSummary {
  const draft = batches.filter((item) => item.status === "draft").length;
  const approved = batches.filter((item) => item.status === "approved").length;
  const exported = batches.filter((item) => item.status === "exported").length;
  const disbursed = batches.filter((item) => item.status === "disbursed" || item.status === "confirmed").length;

  let executionState: RuntimeExecutionState = "waiting";
  let executionLabel = "等待生成代发批次";
  let executionMessage = "先基于已确认工资生成代发批次，再进入审批、导出和银行执行。";

  if (selectedBatch?.status === "disbursed" || selectedBatch?.status === "confirmed") {
    executionState = "succeeded";
    executionLabel = "代发已完成";
    executionMessage = "当前批次已经完成代发，后续重点转入回单核对、银行对账和社保关账。";
  } else if (selectedBatch?.status === "approved" || selectedBatch?.status === "exported" || approved > 0 || exported > 0) {
    executionState = "running";
    executionLabel = "代发处理中";
    executionMessage = "当前批次已进入审批或导出阶段，下一步应完成银行执行与结果回写。";
  }

  const isDraftStage = selectedBatch?.status === "draft";
  const isExportedStage = selectedBatch?.status === "exported";
  const canPushTransfer = canFinallyAuthorize(roleIds) || hasAnyRole(roleIds, ["role-cashier"]);

  let authorizationState: RuntimeAuthorizationState = "not_required";
  let authorizationLabel = "当前无需授权";
  let authorizationMessage = "当前批次已越过审批节点，后续动作以导出、执行和对账为主。";

  if (isDraftStage) {
    authorizationState = canFinallyAuthorize(roleIds) ? "authorized" : "awaiting_authorization";
    authorizationLabel = authorizationState === "authorized" ? "你可审批代发" : "等待代发审批";
    authorizationMessage =
      authorizationState === "authorized"
        ? "当前身份可批准代发批次并推进银行导出。"
        : "当前批次还停留在草稿审批节点，需要财务负责人或董事长授权。";
  } else if (isExportedStage) {
    authorizationState = canPushTransfer ? "authorized" : "awaiting_authorization";
    authorizationLabel = authorizationState === "authorized" ? "你可推进代发" : "等待代发执行授权";
    authorizationMessage =
      authorizationState === "authorized"
        ? "当前身份可确认银行已执行，并回写代发完成结果。"
        : "当前批次已导出，但本账号不具备推进银行执行结果回写的授权。";
  }

  const needsCompensationRepair = Boolean(
    selectedBatch &&
    (selectedBatch.status === "disbursed" || selectedBatch.status === "confirmed") &&
    selectedBatch.compensation_status !== "completed"
  );

  if (needsCompensationRepair) {
    executionState = "failed";
    executionLabel = "补偿失败待修复";
    executionMessage = "工资代发已完成，但下游经营事项补偿未闭环，需要先修复后再继续核对与归档。";
    authorizationState = canPushTransfer ? "authorized" : "awaiting_authorization";
    authorizationLabel = authorizationState === "authorized" ? "你可执行修复" : "等待代发修复授权";
    authorizationMessage =
      authorizationState === "authorized"
        ? "当前身份可直接补偿工资代发下游事项，并刷新当前批次状态。"
        : "当前批次存在补偿失败，但本账号不具备执行修复动作的授权。";
  }

  return {
    executionState,
    executionLabel,
    executionMessage,
    authorizationState,
    authorizationLabel,
    authorizationMessage,
    stats: [
      { label: "草稿批次", value: String(draft) },
      { label: "待导出/待执行", value: String(approved + exported) },
      { label: "已代发", value: String(disbursed) }
    ],
    issue: needsCompensationRepair
      ? {
          tone: selectedBatch?.compensation_status === "failed" ? "error" : "warning",
          title: "代发补偿失败",
          message: selectedBatch?.last_error || "当前批次下游经营事项未闭环，需要重新补偿。",
          detail: selectedBatch?.next_retry_at
            ? `建议在 ${new Date(selectedBatch.next_retry_at).toLocaleString("zh-CN")} 前完成修复或人工复核。`
            : "点击修复动作后，应生成或复用经营事项并刷新当前批次状态。"
        }
      : undefined,
    actions: needsCompensationRepair && selectedBatch
      ? [
          {
            key: "compensate-transfer-batch",
            label: "执行补偿修复",
            tone: "danger",
            params: { batchId: selectedBatch.id }
          }
        ]
      : []
  };
}
