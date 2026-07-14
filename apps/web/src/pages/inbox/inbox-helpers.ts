/**
 * 「我的一天」统一收件箱 · 共享工具函数
 * 供 InboxTasksCard / InboxRiskCard / InboxApprovalsCard 复用。
 */
import type { Task, WorkflowResourceType } from "@finance-taxation/domain-model";

export type TaskWithOverdue = Task & { isOverdue?: boolean };

const ACTIVE_TASK_STATUSES: ReadonlySet<Task["status"]> = new Set([
  "not_started", "in_progress", "in_review", "blocked",
]);

const RESOURCE_TYPE_PATH: Record<WorkflowResourceType, string> = {
  business_event: "/events",
  task: "/tasks",
  tax_filing_batch: "/tax",
  contract: "/contracts",
  voucher: "/vouchers",
  payroll: "/payroll/transfer",
  export_job: "/archive-package",
  generic: "/audit",
};

const RESOURCE_TYPE_LABEL: Record<WorkflowResourceType, string> = {
  business_event: "经营事项",
  task: "任务",
  tax_filing_batch: "税务申报批次",
  contract: "合同",
  voucher: "凭证",
  payroll: "薪酬发放",
  export_job: "导出任务",
  generic: "其他事项",
};

export function resourceTypePath(type: WorkflowResourceType): string {
  return RESOURCE_TYPE_PATH[type] ?? "/audit";
}

export function resourceTypeLabel(type: WorkflowResourceType): string {
  return RESOURCE_TYPE_LABEL[type] ?? "其他事项";
}

/** 未完成任务，逾期优先，其次按截止日期升序排列。 */
export function sortInboxTasks(tasks: readonly TaskWithOverdue[]): TaskWithOverdue[] {
  return tasks
    .filter((task) => ACTIVE_TASK_STATUSES.has(task.status))
    .slice()
    .sort((a, b) => {
      if (!!a.isOverdue !== !!b.isOverdue) return a.isOverdue ? -1 : 1;
      const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
      const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
      return aDue - bDue;
    });
}

export function formatDueLabel(dueAt: string | null): string {
  if (!dueAt) return "无截止日期";
  const parsed = new Date(dueAt);
  if (Number.isNaN(parsed.getTime())) return "无截止日期";
  return `截止 ${parsed.toLocaleDateString("zh-CN")}`;
}

const RISK_SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

export function rankRiskSeverity(severity: string): number {
  return RISK_SEVERITY_RANK[severity] ?? 9;
}

const TASK_PRIORITY_SHORT_LABEL: Record<Task["priority"], string> = {
  critical: "紧急", high: "高", medium: "中", low: "低",
};

export function taskPriorityShortLabel(priority: Task["priority"]): string {
  return TASK_PRIORITY_SHORT_LABEL[priority] ?? priority;
}
