import test from "node:test";
import assert from "node:assert/strict";
import type {
  BusinessEvent,
  LedgerEntry,
  Task,
  TaxFilingBatch,
  Voucher
} from "@finance-taxation/domain-model";
import { buildDashboardSnapshot } from "./summary.js";

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
