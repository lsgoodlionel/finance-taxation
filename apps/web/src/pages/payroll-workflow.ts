import type { PayrollRecord } from "@finance-taxation/domain-model";

export type PayrollWorkflowAction =
  | "confirm_records"
  | "create_event"
  | "review_tax"
  | "run_risk_check";

interface PayrollWorkflowStep {
  title: string;
  state: "done" | "pending";
}

export function buildPayrollWorkflow({
  period,
  records,
  linkedEventId
}: {
  period: string;
  records: PayrollRecord[];
  linkedEventId: string | null;
}) {
  const hasRecords = records.length > 0;
  const allConfirmed = hasRecords && records.every((record) => record.status === "confirmed");
  const hasEvent = Boolean(linkedEventId);

  const steps: PayrollWorkflowStep[] = [
    { title: "工资计算", state: hasRecords ? "done" : "pending" },
    { title: "工资确认", state: allConfirmed ? "done" : "pending" },
    { title: "生成工资事项", state: hasEvent ? "done" : "pending" },
    { title: "个税/社保/公积金复核", state: hasEvent && allConfirmed ? "pending" : "pending" },
    { title: "风险检查", state: hasEvent && allConfirmed ? "pending" : "pending" }
  ];

  const recommendedActions: PayrollWorkflowAction[] = [];
  if (!allConfirmed) recommendedActions.push("confirm_records");
  if (!hasEvent) recommendedActions.push("create_event");
  if (allConfirmed && hasEvent) {
    recommendedActions.push("review_tax", "run_risk_check");
  }

  const summary = !hasRecords
    ? `工资期间 ${period} 还没有计算结果，请先生成工资记录。`
    : !allConfirmed
      ? `工资期间 ${period} 仍有未确认记录，建议先完成确认，再进入事项和税务流转。`
      : !hasEvent
        ? `工资期间 ${period} 已确认，但尚未生成工资事项，建议接入事项主线。`
        : `工资期间 ${period} 已进入事项主线，建议进入税务中心复核个税/社保/公积金并执行风险检查。`;

  return { steps, recommendedActions, summary };
}
