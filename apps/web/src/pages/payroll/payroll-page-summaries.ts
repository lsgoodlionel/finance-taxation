/**
 * 工资页要用的派生数据。
 *
 * V10 收口时清掉了 6 个「算了但没人用」的字段：payrollWorkflow / payrollLinkage /
 * payrollTaxReview / payrollArtifactSummary / payrollVoucherSuggestions /
 * payrollRiskBuckets。它们的消费方（PayrollWorkflowSummary、PayrollRunSection）
 * 早在工资计算改成向导时就从渲染树里摘掉了，函数却还在每次渲染时把这一整套
 * 汇总重算一遍——包括遍历全部工资记录和风险发现。
 *
 * 现在只留运行态面板真正读的两项。要恢复其中任何一项，请连同它的展示组件一起加回来。
 */
import type { PayrollRecord, PayrollPeriodSummary, PayrollTaxReviewLedger } from "@finance-taxation/domain-model";
import { derivePayrollRuntimeSummary } from "../../features/runtime/workflow-runtime";

export interface PayrollPageSummariesInput {
  /** 用户当前正在处理的工资期间（与工资向导同一个值）。 */
  activePeriod: string;
  periods: PayrollPeriodSummary[];
  payrollRecords: PayrollRecord[];
  linkedEventId: string | null;
  linkedRiskCount: number;
  reviewLedgers: PayrollTaxReviewLedger[];
  roleIds: string[];
}

export interface PayrollPageSummaries {
  /** 运行态按哪个期间取：优先当前期间，其次账套里最近的一期。 */
  runtimePeriod: string;
  localRuntimeSummary: ReturnType<typeof derivePayrollRuntimeSummary>;
}

export function buildPayrollPageSummaries({
  activePeriod,
  periods,
  payrollRecords,
  linkedEventId,
  linkedRiskCount,
  reviewLedgers,
  roleIds
}: PayrollPageSummariesInput): PayrollPageSummaries {
  const runtimePeriod = activePeriod || periods[0]?.period || "";
  return {
    runtimePeriod,
    localRuntimeSummary: derivePayrollRuntimeSummary(
      runtimePeriod,
      payrollRecords,
      linkedEventId,
      reviewLedgers,
      linkedRiskCount,
      roleIds
    )
  };
}
