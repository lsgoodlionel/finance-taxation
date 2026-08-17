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
      accountingDate: "2026-05-15",
      voucherNumber: null,
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
      accountingDate: "2026-05-15",
      voucherNumber: null,
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
      accountCode: "6401",
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
      accountCode: "6601",
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
    ledgerEntry({ id: "le-3", accountCode: "6401", debit: "400.00" }),
    ledgerEntry({ id: "le-4", accountCode: "6601", debit: "100.00" }),
    ledgerEntry({ id: "le-5", accountCode: "6602", debit: "50.00" }),
    ledgerEntry({ id: "le-6", accountCode: "6801", debit: "60.00" }),
    ledgerEntry({ id: "le-7", accountCode: "1002", debit: "1300.00" })
  ];

  const snapshot = snapshotFor(entries, { startDate: "2026-05-01", endDate: "2026-05-31" });
  const statement = buildProfitStatementReport({ periodLabel: "2026-05", entries });

  assert.equal(snapshot.profitOverview.revenue, statement.totals.revenue);
  assert.equal(snapshot.profitOverview.cost, statement.totals.cost);
  assert.equal(snapshot.profitOverview.expense, statement.totals.expenses);
  assert.equal(snapshot.profitOverview.grossProfit, statement.totals.grossProfit);
  assert.equal(snapshot.profitOverview.incomeTax, statement.totals.incomeTax);
  assert.equal(snapshot.profitOverview.netProfit, statement.totals.netProfit);
});

test("buildDashboardSnapshot exposes 所得税费用 separately from 期间费用", () => {
  // Arrange：期间费用 100（6201）与所得税费用 60（6801）必须分列，否则前端
  // 拿 revenue - cost - expense 当利润会虚高一个税额，饼图分块之和也少一块。
  const entries: LedgerEntry[] = [
    ledgerEntry({ id: "le-1", accountCode: "6001", credit: "1000.00" }),
    ledgerEntry({ id: "le-2", accountCode: "6401", debit: "400.00" }),
    ledgerEntry({ id: "le-3", accountCode: "6601", debit: "100.00" }),
    ledgerEntry({ id: "le-4", accountCode: "6801", debit: "60.00" })
  ];

  // Act
  const { profitOverview } = snapshotFor(entries, { startDate: "2026-05-01", endDate: "2026-05-31" });

  // Assert
  assert.equal(profitOverview.expense, "100");
  assert.equal(profitOverview.incomeTax, "60");
  assert.equal(profitOverview.netProfit, "440");
  // 饼图不变式：成本 + 费用 + 所得税 + 净利 = 营业收入
  const slices = ["cost", "expense", "incomeTax", "netProfit"] as const;
  const sliceSum = slices.reduce((sum, key) => sum + Number(profitOverview[key]), 0);
  assert.equal(sliceSum, Number(profitOverview.revenue));
});

test("buildDashboardSnapshot reports zero 所得税费用 when the period has no 6801 entries", () => {
  // Arrange
  const entries: LedgerEntry[] = [
    ledgerEntry({ id: "le-1", accountCode: "6001", credit: "1000.00" }),
    ledgerEntry({ id: "le-2", accountCode: "6401", debit: "400.00" })
  ];

  // Act
  const { profitOverview } = snapshotFor(entries, { startDate: "2026-05-01", endDate: "2026-05-31" });

  // Assert
  assert.equal(profitOverview.incomeTax, "0");
  assert.equal(profitOverview.netProfit, "600");
});

// ─── V11：结转损益排除 + 整元展示口径自洽 ────────────────────────────────────

/** 构造一条结转损益分录。 */
function closingLedgerEntry(
  overrides: Partial<LedgerEntry> & { id: string; accountCode: string }
): LedgerEntry {
  return { ...ledgerEntry(overrides), source: "period_closing" };
}

test("dashboard profit overview ignores period-closing entries for the closed period", () => {
  // Arrange：本期业务分录 + 期末结转分录（金额恰好相反，entry_date 落在本期之内）
  const business: LedgerEntry[] = [
    ledgerEntry({ id: "le-1", accountCode: "6001", credit: "1000.00" }),
    ledgerEntry({ id: "le-2", accountCode: "6401", debit: "400.00" }),
    ledgerEntry({ id: "le-3", accountCode: "6601", debit: "100.00" })
  ];
  const closing: LedgerEntry[] = [
    closingLedgerEntry({ id: "cl-1", accountCode: "6001", debit: "1000.00", entryDate: "2026-05-31" }),
    closingLedgerEntry({ id: "cl-2", accountCode: "6401", credit: "400.00", entryDate: "2026-05-31" }),
    closingLedgerEntry({ id: "cl-3", accountCode: "6601", credit: "100.00", entryDate: "2026-05-31" }),
    closingLedgerEntry({ id: "cl-4", accountCode: "4103", credit: "500.00", entryDate: "2026-05-31" })
  ];
  const period = { startDate: "2026-05-01", endDate: "2026-05-31" };

  // Act
  const before = snapshotFor(business, period).profitOverview;
  const after = snapshotFor([...business, ...closing], period).profitOverview;

  // Assert：月结不改变「本月经营成果」（旧实现结转后全部塌成 0）
  assert.deepEqual(after, before);
  assert.equal(after.revenue, "1000");
  assert.equal(after.netProfit, "500");
});

test("dashboard profit overview stays internally consistent when totals need rounding", () => {
  // Arrange：刻意选取会各自向不同方向舍入的小数。
  // 收入 100.4 → 100，成本 0.5 → 1，费用 0.4 → 0，所得税 0.4 → 0。
  // 旧实现对毛利/净利各自独立舍入原始值（99.9 → 100、99.5 → 100），
  // 于是「收入 − 成本 = 毛利」在展示层变成 100 − 1 = 99 ≠ 100。
  const entries: LedgerEntry[] = [
    ledgerEntry({ id: "le-1", accountCode: "6001", credit: "100.40" }),
    ledgerEntry({ id: "le-2", accountCode: "6401", debit: "0.50" }),
    ledgerEntry({ id: "le-3", accountCode: "6601", debit: "0.40" }),
    ledgerEntry({ id: "le-4", accountCode: "6801", debit: "0.40" })
  ];

  // Act
  const { profitOverview } = snapshotFor(entries, { startDate: "2026-05-01", endDate: "2026-05-31" });
  const num = (key: keyof typeof profitOverview) => Number(profitOverview[key]);

  // Assert：展示层的两条会计恒等式必须严格成立
  assert.equal(num("grossProfit"), num("revenue") - num("cost"), "毛利 = 收入 − 成本");
  assert.equal(
    num("netProfit"),
    num("revenue") - num("cost") - num("expense") - num("incomeTax"),
    "净利 = 收入 − 成本 − 费用 − 所得税"
  );
  // 费用构成饼图：各分块之和必须精确等于营业收入，否则分块比例加起来不是 100%
  const slices = ["cost", "expense", "incomeTax", "netProfit"] as const;
  assert.equal(
    slices.reduce((sum, key) => sum + num(key), 0),
    num("revenue"),
    "饼图分块之和 = 营业收入"
  );
  // 比率与展示出来的整元金额同源，避免「净利 99 ÷ 收入 100 = 99.60%」这种自相矛盾
  assert.equal(
    profitOverview.netMargin,
    `${((num("netProfit") / num("revenue")) * 100).toFixed(2)}%`
  );
  assert.equal(
    profitOverview.grossMargin,
    `${((num("grossProfit") / num("revenue")) * 100).toFixed(2)}%`
  );
});

test("dashboard profit overview keeps the pie-chart invariant for many rounding combinations", () => {
  // 把上一条从"一个精心挑的例子"扩展成一小片穷举，防止改动只对某个数字凑巧成立。
  const period = { startDate: "2026-05-01", endDate: "2026-05-31" };
  const cents = ["0.05", "0.40", "0.50", "0.55", "0.99", "1.50"];

  for (const cost of cents) {
    for (const expense of cents) {
      for (const tax of cents) {
        const entries: LedgerEntry[] = [
          ledgerEntry({ id: "le-1", accountCode: "6001", credit: "100.45" }),
          ledgerEntry({ id: "le-2", accountCode: "6401", debit: cost }),
          ledgerEntry({ id: "le-3", accountCode: "6601", debit: expense }),
          ledgerEntry({ id: "le-4", accountCode: "6801", debit: tax })
        ];
        const { profitOverview: o } = snapshotFor(entries, period);
        const n = (key: keyof typeof o) => Number(o[key]);
        const label = `cost=${cost} expense=${expense} tax=${tax}`;
        assert.equal(n("grossProfit"), n("revenue") - n("cost"), `毛利恒等式失败：${label}`);
        assert.equal(
          n("netProfit"),
          n("grossProfit") - n("expense") - n("incomeTax"),
          `净利恒等式失败：${label}`
        );
      }
    }
  }
});
