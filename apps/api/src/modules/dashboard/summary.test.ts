import test from "node:test";
import assert from "node:assert/strict";
import type {
  BusinessEvent,
  LedgerEntry,
  Task,
  TaxFilingBatch,
  Voucher
} from "@finance-taxation/domain-model";
import { buildProfitStatementReport } from "../reports/summary.js";
import { buildDashboardSnapshot } from "./summary.js";

function ledgerEntry(overrides: Partial<LedgerEntry> & { id: string; accountCode: string }): LedgerEntry {
  return {
    companyId: "cmp-1",
    voucherId: "v-1",
    businessEventId: "evt-1",
    entryDate: "2026-05-15",
    summary: "分录",
    accountName: overrides.accountCode,
    debit: "0.00",
    credit: "0.00",
    source: "voucher_posting",
    postedAt: "2026-05-15T05:00:00.000Z",
    ...overrides
  };
}

function snapshotFor(entries: LedgerEntry[], period: { startDate: string; endDate: string }) {
  return buildDashboardSnapshot({
    now: "2026-05-15T10:00:00.000Z",
    period,
    events: [],
    tasks: [],
    vouchers: [],
    ledgerEntries: entries,
    taxFilingBatches: []
  });
}

test("buildDashboardSnapshot aggregates profit, queues, and ai summary", () => {
  const events: BusinessEvent[] = [
    {
      id: "evt-1",
      companyId: "cmp-1",
      type: "sales",
      title: "销售合同",
      description: "",
      department: "销售部",
      ownerId: "u1",
      occurredOn: "2026-05-15",
      amount: "1000.00",
      currency: "CNY",
      status: "analyzed",
      source: "manual",
      createdAt: "2026-05-15T01:00:00.000Z",
      updatedAt: "2026-05-15T01:00:00.000Z"
    },
    {
      id: "evt-2",
      companyId: "cmp-1",
      type: "expense",
      title: "阻塞事项",
      description: "",
      department: "财务部",
      ownerId: "u1",
      occurredOn: "2026-05-15",
      amount: "300.00",
      currency: "CNY",
      status: "blocked",
      source: "manual",
      createdAt: "2026-05-15T02:00:00.000Z",
      updatedAt: "2026-05-15T02:00:00.000Z"
    }
  ];

  const tasks: Task[] = [
    {
      id: "task-1",
      companyId: "cmp-1",
      businessEventId: "evt-1",
      parentTaskId: null,
      title: "阻塞任务",
      description: "",
      status: "blocked",
      priority: "high",
      ownerId: "u1",
      dueAt: "2026-05-14T00:00:00.000Z",
      assigneeDepartment: "财务部",
      source: "ai",
      createdAt: "2026-05-15T03:00:00.000Z",
      updatedAt: "2026-05-15T03:00:00.000Z"
    }
  ];

  const vouchers: Voucher[] = [
    {
      id: "v-1",
      companyId: "cmp-1",
      businessEventId: "evt-1",
      mappingId: "m-1",
      voucherType: "accrual",
      summary: "销售凭证",
      status: "review_required",
      lines: [],
      approvedAt: null,
      postedAt: null,
      source: "analysis",
      createdAt: "2026-05-15T04:00:00.000Z",
      updatedAt: "2026-05-15T04:00:00.000Z"
    },
    {
      id: "v-2",
      companyId: "cmp-1",
      businessEventId: "evt-1",
      mappingId: "m-2",
      voucherType: "accrual",
      summary: "已过账凭证",
      status: "posted",
      lines: [],
      approvedAt: "2026-05-15T05:00:00.000Z",
      postedAt: "2026-05-15T05:00:00.000Z",
      source: "analysis",
      createdAt: "2026-05-15T05:00:00.000Z",
      updatedAt: "2026-05-15T05:00:00.000Z"
    }
  ];

  const ledgerEntries: LedgerEntry[] = [
    {
      id: "le-1",
      companyId: "cmp-1",
      voucherId: "v-2",
      businessEventId: "evt-1",
      entryDate: "2026-05-15",
      summary: "收入",
      accountCode: "6001",
      accountName: "主营业务收入",
      debit: "0.00",
      credit: "1000.00",
      source: "voucher_posting",
      postedAt: "2026-05-15T05:00:00.000Z"
    },
    {
      id: "le-2",
      companyId: "cmp-1",
      voucherId: "v-2",
      businessEventId: "evt-1",
      entryDate: "2026-05-15",
      summary: "成本",
      accountCode: "6001c",
      accountName: "主营业务成本",
      debit: "400.00",
      credit: "0.00",
      source: "voucher_posting",
      postedAt: "2026-05-15T05:00:00.000Z"
    },
    {
      id: "le-3",
      companyId: "cmp-1",
      voucherId: "v-2",
      businessEventId: "evt-2",
      entryDate: "2026-05-15",
      summary: "费用",
      accountCode: "6201",
      accountName: "销售费用",
      debit: "100.00",
      credit: "0.00",
      source: "voucher_posting",
      postedAt: "2026-05-15T05:00:00.000Z"
    }
  ];

  const batches: TaxFilingBatch[] = [
    {
      id: "tb-1",
      companyId: "cmp-1",
      taxType: "增值税",
      filingPeriod: "2026-05",
      status: "review_required",
      itemIds: ["tx-1"],
      createdAt: "2026-05-15T06:00:00.000Z",
      updatedAt: "2026-05-15T06:00:00.000Z"
    }
  ];

  const snapshot = buildDashboardSnapshot({
    now: "2026-05-15T10:00:00.000Z",
    period: { startDate: "2026-05-01", endDate: "2026-05-31" },
    events,
    tasks,
    vouchers,
    ledgerEntries,
    taxFilingBatches: batches
  });

  assert.equal(snapshot.profitOverview.revenue, "1000");
  assert.equal(snapshot.profitOverview.cost, "400");
  assert.equal(snapshot.profitOverview.expense, "100");
  assert.equal(snapshot.profitOverview.grossMargin, "60.00%");
  assert.equal(snapshot.profitOverview.netMargin, "50.00%");
  assert.equal(snapshot.queues.approvals, 1);
  assert.equal(snapshot.queues.blockedTasks, 1);
  assert.equal(snapshot.queues.overdueTasks, 1);
  assert.equal(snapshot.riskBoard.riskEvents.length, 1);
  assert.equal(snapshot.aiSummary.newEvents, 2);
  assert.equal(snapshot.aiSummary.postedVouchers, 1);
  assert.equal(snapshot.aiSummary.pendingTaxBatches, 1);
});

test("buildDashboardSnapshot only counts ledger entries inside the accounting period", () => {
  // Arrange：上期与下期各一笔收入，驾驶舱此前无期间过滤，把开业至今累计当成「本月」
  const entries: LedgerEntry[] = [
    ledgerEntry({ id: "le-prev", accountCode: "6001", entryDate: "2026-04-30", credit: "700.00" }),
    ledgerEntry({ id: "le-in", accountCode: "6001", entryDate: "2026-05-15", credit: "1000.00" }),
    ledgerEntry({ id: "le-next", accountCode: "6001", entryDate: "2026-06-01", credit: "500.00" })
  ];

  // Act
  const snapshot = snapshotFor(entries, { startDate: "2026-05-01", endDate: "2026-05-31" });

  // Assert
  assert.equal(snapshot.profitOverview.revenue, "1000");
  assert.equal(snapshot.profitOverview.netProfit, "1000");
});

test("buildDashboardSnapshot counts every revenue account, not just 6001", () => {
  const entries: LedgerEntry[] = [
    ledgerEntry({ id: "le-1", accountCode: "6001", credit: "1000.00" }),
    ledgerEntry({ id: "le-2", accountCode: "6051", credit: "300.00" })
  ];

  const snapshot = snapshotFor(entries, { startDate: "2026-05-01", endDate: "2026-05-31" });

  assert.equal(snapshot.profitOverview.revenue, "1300");
});

test("buildDashboardSnapshot net profit matches the formal profit statement for the same entries", () => {
  // 首页「本月赚了多少」点击下钻到 /reports，两处必须给出同一个数字
  const entries: LedgerEntry[] = [
    ledgerEntry({ id: "le-1", accountCode: "6001", credit: "1000.00" }),
    ledgerEntry({ id: "le-2", accountCode: "6051", credit: "300.00" }),
    ledgerEntry({ id: "le-3", accountCode: "6001c", debit: "400.00" }),
    ledgerEntry({ id: "le-4", accountCode: "6201", debit: "100.00" }),
    ledgerEntry({ id: "le-5", accountCode: "6301e", debit: "50.00" }),
    ledgerEntry({ id: "le-6", accountCode: "6801", debit: "60.00" }),
    ledgerEntry({ id: "le-7", accountCode: "1002", debit: "1300.00" })
  ];

  const snapshot = snapshotFor(entries, { startDate: "2026-05-01", endDate: "2026-05-31" });
  const statement = buildProfitStatementReport({ periodLabel: "2026-05", entries });

  assert.equal(snapshot.profitOverview.revenue, statement.totals.revenue);
  assert.equal(snapshot.profitOverview.cost, statement.totals.cost);
  assert.equal(snapshot.profitOverview.expense, statement.totals.expenses);
  assert.equal(snapshot.profitOverview.grossProfit, statement.totals.grossProfit);
  assert.equal(snapshot.profitOverview.netProfit, statement.totals.netProfit);
});
