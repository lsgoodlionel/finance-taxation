import {
  formatTaxDeadlineHint,
  isInboxAllClear,
  selectOtherInboxItems,
  summarizeInboxFocus,
  summarizeTaxDeadlines
} from "./inbox-focus";
import type { InboxItem, TaxDeadline } from "../../lib/api";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function item(partial: Partial<InboxItem> & { key: string; count: number }): InboxItem {
  return {
    label: partial.key,
    tone: "info",
    actionPath: "/events",
    hint: "",
    ...partial
  } as InboxItem;
}

function deadline(partial: Partial<TaxDeadline> & { taxType: string }): TaxDeadline {
  return {
    label: partial.taxType,
    dueDate: "2026-08-15",
    daysLeft: 10,
    filed: false,
    urgent: false,
    ...partial
  } as TaxDeadline;
}

// ── 其他模块待办：过滤掉零数量与已被待办任务卡覆盖的两类 ────────────────────
const others = selectOtherInboxItems([
  item({ key: "overdue_tasks", count: 3 }),
  item({ key: "todo_tasks", count: 5 }),
  item({ key: "pending_events", count: 2 }),
  item({ key: "draft_vouchers", count: 0 }),
  item({ key: "unmatched_statements", count: 4, tone: "warning" })
]);
assert(others.length === 2, "只保留有数量且不与待办任务卡重复的条目");
assert(others.map((entry) => entry.key).join(",") === "pending_events,unmatched_statements", "保序");

// ── 紧急口径：逾期任务 + 高危/致命风险 + 其他模块的告警类待办 ───────────────
const focus = summarizeInboxFocus({
  items: [
    item({ key: "overdue_tasks", count: 3 }),
    item({ key: "unmatched_statements", count: 4, tone: "warning" }),
    item({ key: "pending_events", count: 9 })
  ],
  totalPending: 16,
  tasks: [{ isOverdue: true }, { isOverdue: true }, { isOverdue: false }],
  findings: [
    { status: "open", severity: "critical" },
    { status: "open", severity: "high" },
    { status: "open", severity: "medium" },
    { status: "closed", severity: "high" }
  ],
  approvalCount: 1
});
assert(focus.overdueTaskCount === 2, "逾期任务只数 isOverdue");
assert(focus.urgentRiskCount === 2, "critical 与 high 都算紧急，closed 不算");
assert(focus.otherUrgentCount === 4, "其他模块只累加 tone=warning 的条数");
assert(focus.urgentTotal === 8, "紧急合计 = 2 + 2 + 4");
assert(focus.totalPending === 16, "待办总数直接沿用后端汇总");
assert(focus.otherItems.length === 2, "其他模块待办排除 overdue_tasks");

// ── 全清判定：不再受「历史上建过任务」影响 ───────────────────────────────
const clear = summarizeInboxFocus({
  items: [],
  totalPending: 0,
  tasks: [{ isOverdue: false }, { isOverdue: false }],
  findings: [{ status: "closed", severity: "high" }],
  approvalCount: 0
});
assert(isInboxAllClear(clear), "没有待办、没有紧急、没有待审批即为全清");
assert(!isInboxAllClear(focus), "还有待办时不算全清");

// ── 申报到期：压成一句话，全部已申报时不显示 ─────────────────────────────
assert(summarizeTaxDeadlines([]) === null, "没有数据时不显示到期行");
assert(
  summarizeTaxDeadlines([deadline({ taxType: "vat", filed: true })]) === null,
  "全部已申报时不显示到期行"
);

const summary = summarizeTaxDeadlines([
  deadline({ taxType: "vat", label: "增值税", daysLeft: 6 }),
  deadline({ taxType: "cit", label: "企业所得税", daysLeft: -2 }),
  deadline({ taxType: "stamp", label: "印花税", filed: true, daysLeft: 1 })
]);
assert(summary !== null, "有未申报税种时应给出汇总");
assert(summary.unfiledCount === 2, "已申报的不计入");
assert(summary.overdueCount === 1, "daysLeft < 0 计为已过截止日");
assert(summary.nearestLabel === "企业所得税", "最近一个 = daysLeft 最小的未申报税种");
assert(
  formatTaxDeadlineHint(summary).includes("其中 1 个已过截止日"),
  "有逾期时优先说逾期"
);

const upcoming = summarizeTaxDeadlines([deadline({ taxType: "vat", label: "增值税", daysLeft: 6 })]);
assert(upcoming !== null, "未申报即应有汇总");
assert(
  formatTaxDeadlineHint(upcoming) === "还有 1 个税种没申报，最近的「增值税」还有 6 天到期",
  "无逾期时说最近一个还有几天"
);

const today = summarizeTaxDeadlines([deadline({ taxType: "vat", label: "增值税", daysLeft: 0 })]);
assert(today !== null, "当天到期也应有汇总");
assert(formatTaxDeadlineHint(today).includes("今天就到期"), "当天到期单独措辞");

console.log("inbox-focus-ok");
