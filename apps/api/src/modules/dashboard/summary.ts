import type {
  BusinessEvent,
  LedgerEntry,
  Task,
  TaxFilingBatch,
  Voucher
} from "@finance-taxation/domain-model";
import { isPeriodClosingEntry } from "../ledger/closing-entries.js";
import { summarizeProfitTotals } from "../reports/profit-accounts.js";
import { formatWhole, formatRate, toWholeYuanOverview } from "./profit-display.js";

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
  /** 期间费用合计，**不含所得税费用**（所得税在 incomeTax 中单列）。 */
  expense: string;
  /**
   * 所得税费用（6801），只在净利润处扣减一次。
   *
   * 前端据此才能把「利润总额 → 净利润」的落差解释清楚，也是费用构成饼图
   * 「各分块之和 = 营业收入」成立的前提：expense 不含税额，缺了这一块就会
   * 把税额算进利润里。
   */
  incomeTax: string;
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

function sameDay(iso: string | null | undefined, day: string): boolean {
  return Boolean(iso && iso.slice(0, 10) === day);
}

/** 驾驶舱盈利概览的会计期间（与 /api/reports 的期间语义一致，闭区间）。 */
export interface DashboardPeriod {
  startDate: string;
  endDate: string;
}

export function buildDashboardSnapshot(input: {
  now: string;
  period: DashboardPeriod;
  events: BusinessEvent[];
  tasks: Task[];
  vouchers: Voucher[];
  ledgerEntries: LedgerEntry[];
  taxFilingBatches: TaxFilingBatch[];
}): DashboardSnapshot {
  const day = input.now.slice(0, 10);

  // 盈利概览必须按当前会计期间过滤：此前无期间过滤，「本月净利」实为开业至今累计。
  //
  // 同时排除结转损益分录（口径见 ledger/closing-entries.ts）：这是「按期间聚合经营
  // 成果」的读路径，结转分录 entry_date 落在本期之内、金额与本期业务分录恰好相反，
  // 不排除的话月结一做完，驾驶舱本月收入/净利立刻全变 0，且毫无报错提示。
  const periodEntries = input.ledgerEntries.filter(
    (entry) =>
      entry.entryDate >= input.period.startDate &&
      entry.entryDate <= input.period.endDate &&
      !isPeriodClosingEntry(entry)
  );
  // 科目口径与正式利润表共用同一纯函数，避免驾驶舱与 /reports 再次漂移。
  const totals = summarizeProfitTotals(periodEntries);

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

  const overview = toWholeYuanOverview(totals);

  return {
    profitOverview: {
      revenue: formatWhole(overview.revenue),
      cost: formatWhole(overview.cost),
      expense: formatWhole(overview.expense),
      incomeTax: formatWhole(overview.incomeTax),
      grossProfit: formatWhole(overview.grossProfit),
      netProfit: formatWhole(overview.netProfit),
      grossMargin: formatRate(overview.grossProfit, overview.revenue),
      netMargin: formatRate(overview.netProfit, overview.revenue)
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
