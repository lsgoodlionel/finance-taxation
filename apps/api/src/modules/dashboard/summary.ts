import type {
  BusinessEvent,
  LedgerEntry,
  Task,
  TaxFilingBatch,
  Voucher
} from "@finance-taxation/domain-model";

interface DashboardQueueItem {
  id: string;
  title: string;
  status: string;
  route: string;
  severity: "high" | "medium" | "low";
}

interface DashboardRiskBoard {
  approvals: DashboardQueueItem[];
  blockedTasks: DashboardQueueItem[];
  overdueTasks: DashboardQueueItem[];
  riskEvents: DashboardQueueItem[];
}

interface DashboardProfitOverview {
  revenue: string;
  cost: string;
  expense: string;
  grossProfit: string;
  netProfit: string;
  grossMargin: string;
  netMargin: string;
}

interface DashboardAiSummary {
  date: string;
  newEvents: number;
  postedVouchers: number;
  pendingTaxBatches: number;
  highlights: string[];
}

export interface DashboardSnapshot {
  profitOverview: DashboardProfitOverview;
  riskBoard: DashboardRiskBoard;
  aiSummary: DashboardAiSummary;
  queues: { approvals: number; blockedTasks: number; overdueTasks: number };
}

function amount(value: string): number {
  return Number(value || 0);
}

function formatWhole(value: number): string {
  return Math.round(value).toString();
}

function formatRate(numerator: number, denominator: number): string {
  if (!denominator) return "0.00%";
  return `${((numerator / denominator) * 100).toFixed(2)}%`;
}

function sameDay(iso: string | null | undefined, day: string): boolean {
  return Boolean(iso && iso.slice(0, 10) === day);
}

export function buildDashboardSnapshot(input: {
  now: string;
  events: BusinessEvent[];
  tasks: Task[];
  vouchers: Voucher[];
  ledgerEntries: LedgerEntry[];
  taxFilingBatches: TaxFilingBatch[];
}): DashboardSnapshot {
  const day = input.now.slice(0, 10);

  const revenue = input.ledgerEntries
    .filter((entry) => entry.accountCode === "6001")
    .reduce((sum, entry) => sum + amount(entry.credit) - amount(entry.debit), 0);
  const cost = input.ledgerEntries
    .filter((entry) => entry.accountCode === "6001c")
    .reduce((sum, entry) => sum + amount(entry.debit) - amount(entry.credit), 0);
  const expense = input.ledgerEntries
    .filter((entry) => ["6201", "6301e", "6401"].includes(entry.accountCode))
    .reduce((sum, entry) => sum + amount(entry.debit) - amount(entry.credit), 0);

  const grossProfit = revenue - cost;
  const netProfit = revenue - cost - expense;

  const approvals = input.vouchers
    .filter((voucher) => voucher.status === "review_required")
    .map((voucher) => ({
      id: voucher.id,
      title: voucher.summary,
      status: voucher.status,
      route: `/vouchers`,
      severity: "medium" as const
    }));

  const blockedTasks = input.tasks
    .filter((task) => task.status === "blocked")
    .map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      route: `/tasks`,
      severity: "high" as const
    }));

  const overdueTasks = input.tasks
    .filter(
      (task) =>
        Boolean(task.dueAt) &&
        new Date(task.dueAt as string).getTime() < new Date(input.now).getTime() &&
        task.status !== "done" &&
        task.status !== "cancelled"
    )
    .map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      route: `/tasks`,
      severity: "high" as const
    }));

  const riskEvents = input.events
    .filter((event) => event.status === "blocked")
    .map((event) => ({
      id: event.id,
      title: event.title,
      status: event.status,
      route: `/events`,
      severity: "high" as const
    }));

  const newEvents = input.events.filter((event) => sameDay(event.createdAt, day)).length;
  const postedVouchers = input.vouchers.filter((voucher) => sameDay(voucher.postedAt, day)).length;
  const pendingTaxBatches = input.taxFilingBatches.filter((batch) => batch.status !== "submitted").length;

  const highlights: string[] = [
    `今日新增事项 ${newEvents} 条`,
    `今日已过账凭证 ${postedVouchers} 张`,
    `待提交税务批次 ${pendingTaxBatches} 个`
  ];

  return {
    profitOverview: {
      revenue: formatWhole(revenue),
      cost: formatWhole(cost),
      expense: formatWhole(expense),
      grossProfit: formatWhole(grossProfit),
      netProfit: formatWhole(netProfit),
      grossMargin: formatRate(grossProfit, revenue),
      netMargin: formatRate(netProfit, revenue)
    },
    riskBoard: {
      approvals,
      blockedTasks,
      overdueTasks,
      riskEvents
    },
    aiSummary: {
      date: day,
      newEvents,
      postedVouchers,
      pendingTaxBatches,
      highlights
    },
    queues: {
      approvals: approvals.length,
      blockedTasks: blockedTasks.length,
      overdueTasks: overdueTasks.length
    }
  };
}
