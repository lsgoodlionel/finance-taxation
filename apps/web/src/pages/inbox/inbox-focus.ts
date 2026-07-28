/**
 * /inbox 首屏「今天的状况」的纯推导（V10 车道 G1）。
 *
 * 改造前这一页把 10 个平级区块摊在一屏：4 个 Statistic、1 条紧急 Alert、
 * 每个税种一张的申报到期卡、新手引导清单，还有一堵和主卡语义并列的
 * 「其他模块待办」卡片墙——它们讲的其实是同一件事的不同侧面，
 * 却各占一块，把真正的主体（四类待办）挤到第 2、3 屏。
 *
 * 这里把这些推导收拢成单一事实来源，页面只负责渲染：
 * - 紧急口径（逾期任务 + 高危/致命风险 + 其他模块的告警类待办）；
 * - 申报到期只保留「还有几个税种没报、最近一个几天后截止」的汇总，
 *   逐税种明细留在 /tax 的「看到期与提醒」里，不在收件箱铺开；
 * - 「其他模块待办」的挑选规则。
 */
import type { InboxItem, TaxDeadline } from "../../lib/api";

/** 已由「待办任务」专属卡片覆盖的收件箱条目，通用清单里不再重复展示。 */
const TASK_INBOX_KEYS: ReadonlySet<string> = new Set(["overdue_tasks", "todo_tasks"]);

/**
 * 算作「紧急」的风险等级。
 * 原实现只数 high，把 critical（致命）漏在外面——比 high 更该催的那一档反而
 * 不进紧急数，属于口径错误，这里一并收进来。
 */
const URGENT_RISK_SEVERITIES: ReadonlySet<string> = new Set(["critical", "high"]);

/** 其他模块待办：有数量、且不与「待办任务」卡重复的条目。 */
export function selectOtherInboxItems(items: readonly InboxItem[]): InboxItem[] {
  return items.filter((item) => item.count > 0 && !TASK_INBOX_KEYS.has(item.key));
}

export interface InboxFocusInput {
  items: readonly InboxItem[];
  totalPending: number;
  tasks: readonly { isOverdue?: boolean }[];
  findings: readonly { status: string; severity: string }[];
  approvalCount: number;
}

export interface InboxFocusSummary {
  /** 跨模块待办总数（后端汇总，含任务）。 */
  totalPending: number;
  overdueTaskCount: number;
  urgentRiskCount: number;
  approvalCount: number;
  /** 其他模块里被标为告警的待办条数之和。 */
  otherUrgentCount: number;
  urgentTotal: number;
  otherItems: InboxItem[];
}

export function summarizeInboxFocus({
  items,
  totalPending,
  tasks,
  findings,
  approvalCount
}: InboxFocusInput): InboxFocusSummary {
  const otherItems = selectOtherInboxItems(items);
  const overdueTaskCount = tasks.filter((task) => task.isOverdue).length;
  const urgentRiskCount = findings.filter(
    (finding) => finding.status === "open" && URGENT_RISK_SEVERITIES.has(finding.severity)
  ).length;
  const otherUrgentCount = otherItems
    .filter((item) => item.tone === "warning")
    .reduce((sum, item) => sum + item.count, 0);

  return {
    totalPending,
    overdueTaskCount,
    urgentRiskCount,
    approvalCount,
    otherUrgentCount,
    urgentTotal: overdueTaskCount + urgentRiskCount + otherUrgentCount,
    otherItems
  };
}

/**
 * 全清判定：跨模块待办为 0、没有紧急项、也没有等审批的。
 *
 * 原实现还要求 `tasks.length === 0`，但那份 tasks 是「全部任务」（含已完成），
 * 只要历史上建过一条任务就永远为假——庆祝语实际上不可达。这里改用真实的
 * 待办口径：totalPending 已经包含了逾期/待开始任务。
 */
export function isInboxAllClear(summary: InboxFocusSummary): boolean {
  return summary.totalPending === 0 && summary.urgentTotal === 0 && summary.approvalCount === 0;
}

export interface TaxDeadlineSummary {
  /** 本期还没报的税种数。 */
  unfiledCount: number;
  /** 其中已经过了截止日的税种数。 */
  overdueCount: number;
  /** 最近一个要报的税种（未申报里 daysLeft 最小的那个）。 */
  nearestLabel: string;
  nearestDaysLeft: number;
}

/**
 * 把逐税种的到期卡压成一句话。
 * 全部已申报（或没有数据）时返回 null——没有要办的事就不该占版面。
 */
export function summarizeTaxDeadlines(
  deadlines: readonly TaxDeadline[]
): TaxDeadlineSummary | null {
  const unfiled = deadlines
    .filter((deadline) => !deadline.filed)
    .slice()
    .sort((a, b) => a.daysLeft - b.daysLeft);
  const nearest = unfiled[0];
  if (!nearest) {
    return null;
  }
  return {
    unfiledCount: unfiled.length,
    overdueCount: unfiled.filter((deadline) => deadline.daysLeft < 0).length,
    nearestLabel: nearest.label,
    nearestDaysLeft: nearest.daysLeft
  };
}

/** 到期汇总的一句话文案（逾期优先说逾期）。 */
export function formatTaxDeadlineHint(summary: TaxDeadlineSummary): string {
  const head = `还有 ${summary.unfiledCount} 个税种没申报`;
  if (summary.overdueCount > 0) {
    return `${head}，其中 ${summary.overdueCount} 个已过截止日`;
  }
  if (summary.nearestDaysLeft <= 0) {
    return `${head}，最近的「${summary.nearestLabel}」今天就到期`;
  }
  return `${head}，最近的「${summary.nearestLabel}」还有 ${summary.nearestDaysLeft} 天到期`;
}
