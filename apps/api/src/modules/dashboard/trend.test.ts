import test from "node:test";
import assert from "node:assert/strict";
import type { LedgerEntry } from "@finance-taxation/domain-model";
import { buildDashboardSnapshot } from "./summary.js";
import { trailingPeriodLabels } from "./period.js";
import {
  buildChairmanTrend,
  DEFAULT_TREND_MONTHS,
  MAX_TREND_MONTHS,
  MIN_TREND_MONTHS,
  resolveTrendMonths
} from "./trend.js";

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

/** 一笔收入 + 一笔成本，落在指定期间。 */
function monthOfBusiness(period: string, revenue: string, cost: string): LedgerEntry[] {
  return [
    ledgerEntry({ id: `${period}-rev`, accountCode: "6001", entryDate: `${period}-10`, credit: revenue }),
    ledgerEntry({ id: `${period}-cost`, accountCode: "6001c", entryDate: `${period}-10`, debit: cost })
  ];
}

function pointAt(trend: ReturnType<typeof buildChairmanTrend>, period: string) {
  const point = trend.points.find((candidate) => candidate.period === period);
  assert.ok(point, `趋势里缺了期间 ${period}`);
  return point;
}

test("buildChairmanTrend 按会计期间聚合各月真实的收入与成本", () => {
  const trend = buildChairmanTrend({
    endPeriod: "2026-05",
    months: 3,
    ledgerEntries: [
      ...monthOfBusiness("2026-03", "1000.00", "400.00"),
      ...monthOfBusiness("2026-04", "600.00", "500.00"),
      ...monthOfBusiness("2026-05", "800.00", "300.00")
    ]
  });

  assert.deepEqual(
    trend.points.map((point) => point.period),
    ["2026-03", "2026-04", "2026-05"]
  );
  assert.equal(pointAt(trend, "2026-03").revenue, "1000");
  assert.equal(pointAt(trend, "2026-04").revenue, "600");
  assert.equal(pointAt(trend, "2026-05").revenue, "800");
  assert.equal(pointAt(trend, "2026-05").cost, "300");
  assert.equal(pointAt(trend, "2026-05").grossProfit, "500");

  // 每个点各算各的：4 月比 3 月是掉下来的。写死系数的旧实现画不出这条下滑曲线。
  assert.ok(Number(pointAt(trend, "2026-04").revenue) < Number(pointAt(trend, "2026-03").revenue));
});

test("没有分录的期间如实留空，既不补零也不外推", () => {
  const trend = buildChairmanTrend({
    endPeriod: "2026-05",
    months: 3,
    ledgerEntries: monthOfBusiness("2026-05", "800.00", "300.00")
  });

  for (const period of ["2026-03", "2026-04"]) {
    const point = pointAt(trend, period);
    assert.equal(point.hasData, false, `${period} 没有账，不该报告为有数据`);
    assert.equal(point.revenue, null, `${period} 的收入必须是 null，不能是 "0"`);
    assert.equal(point.cost, null);
    assert.equal(point.expense, null);
    assert.equal(point.grossProfit, null);
    assert.equal(point.netProfit, null);
  }

  // 横轴上仍占一格：抹掉空月会让 2 月与 5 月在图上紧挨着，看起来是连续的。
  assert.equal(trend.points.length, 3);
  assert.equal(trend.periodsWithData, 1);
});

test("「没有账」与「有账但收入为 0」是两回事", () => {
  const trend = buildChairmanTrend({
    endPeriod: "2026-05",
    months: 2,
    ledgerEntries: [
      // 4 月记了账，但只有一笔银行划转，确实没有开张。
      ledgerEntry({ id: "transfer-d", accountCode: "1002", entryDate: "2026-04-20", debit: "5000.00" }),
      ledgerEntry({ id: "transfer-c", accountCode: "1122", entryDate: "2026-04-20", credit: "5000.00" })
    ]
  });

  const april = pointAt(trend, "2026-04");
  assert.equal(april.hasData, true, "4 月账上有分录，只是没有损益");
  assert.equal(april.revenue, "0", "有账而无收入是一个真实的 0，不是留白");

  const may = pointAt(trend, "2026-05");
  assert.equal(may.hasData, false, "5 月根本没有账");
  assert.equal(may.revenue, null);
});

test("排除结转损益分录：月结之后那个月不会塌成 0", () => {
  const closed = buildChairmanTrend({
    endPeriod: "2026-04",
    months: 1,
    ledgerEntries: [
      ...monthOfBusiness("2026-04", "1000.00", "400.00"),
      // closePeriod 写入的结转分录：entry_date 落在本期之内，金额与业务分录恰好相反。
      ledgerEntry({
        id: "close-rev",
        accountCode: "6001",
        entryDate: "2026-04-30",
        debit: "1000.00",
        source: "period_closing"
      }),
      ledgerEntry({
        id: "close-cost",
        accountCode: "6001c",
        entryDate: "2026-04-30",
        credit: "400.00",
        source: "period_closing"
      })
    ]
  });

  const april = pointAt(closed, "2026-04");
  assert.equal(april.hasData, true);
  assert.equal(april.revenue, "1000", "结转分录不得把已结账期间的收入抵成 0");
  assert.equal(april.cost, "400");
});

test("所得税费用从 expense 中拆出，口径与 profitOverview 一致", () => {
  const trend = buildChairmanTrend({
    endPeriod: "2026-05",
    months: 1,
    ledgerEntries: [
      ...monthOfBusiness("2026-05", "1000.00", "400.00"),
      ledgerEntry({ id: "admin", accountCode: "6602", entryDate: "2026-05-20", debit: "100.00" }),
      ledgerEntry({ id: "tax", accountCode: "6801", entryDate: "2026-05-25", debit: "50.00" })
    ]
  });

  const may = pointAt(trend, "2026-05");
  assert.equal(may.expense, "100", "expense 不含所得税费用");
  assert.equal(may.incomeTax, "50");
  assert.equal(may.grossProfit, "600");
  assert.equal(may.netProfit, "450", "净利 = 毛利 − 费用 − 所得税，所得税只扣一次");
});

test("趋势最后一个点与驾驶舱利润概览卡片逐字段相等", () => {
  // 同一屏上「本月」出现两次：卡片一次、趋势图末点一次。两处若各自舍入，
  // 同一个月就会在卡上写 100、在图上画 101。
  const entries = [
    ledgerEntry({ id: "rev", accountCode: "6001", entryDate: "2026-05-10", credit: "100.40" }),
    ledgerEntry({ id: "cost", accountCode: "6001c", entryDate: "2026-05-10", debit: "0.50" }),
    ledgerEntry({ id: "admin", accountCode: "6602", entryDate: "2026-05-20", debit: "10.30" }),
    ledgerEntry({ id: "tax", accountCode: "6801", entryDate: "2026-05-25", debit: "3.70" })
  ];

  const snapshot = buildDashboardSnapshot({
    now: "2026-05-31T10:00:00.000Z",
    period: { startDate: "2026-05-01", endDate: "2026-05-31" },
    events: [],
    tasks: [],
    vouchers: [],
    ledgerEntries: entries,
    taxFilingBatches: []
  });
  const last = pointAt(buildChairmanTrend({ endPeriod: "2026-05", months: 6, ledgerEntries: entries }), "2026-05");

  const { profitOverview } = snapshot;
  assert.equal(last.revenue, profitOverview.revenue);
  assert.equal(last.cost, profitOverview.cost);
  assert.equal(last.expense, profitOverview.expense);
  assert.equal(last.incomeTax, profitOverview.incomeTax);
  assert.equal(last.grossProfit, profitOverview.grossProfit);
  assert.equal(last.netProfit, profitOverview.netProfit);
});

test("期间边界是闭区间，相邻月份的分录不会互相串", () => {
  const trend = buildChairmanTrend({
    endPeriod: "2026-05",
    months: 2,
    ledgerEntries: [
      ledgerEntry({ id: "apr-last", accountCode: "6001", entryDate: "2026-04-30", credit: "100.00" }),
      ledgerEntry({ id: "may-first", accountCode: "6001", entryDate: "2026-05-01", credit: "200.00" }),
      ledgerEntry({ id: "may-last", accountCode: "6001", entryDate: "2026-05-31", credit: "300.00" })
    ]
  });

  assert.equal(pointAt(trend, "2026-04").revenue, "100");
  assert.equal(pointAt(trend, "2026-05").revenue, "500");
});

test("区间外的分录不参与聚合", () => {
  const trend = buildChairmanTrend({
    endPeriod: "2026-05",
    months: 2,
    ledgerEntries: [
      ...monthOfBusiness("2026-01", "9999.00", "9999.00"),
      ...monthOfBusiness("2026-05", "800.00", "300.00")
    ]
  });

  assert.equal(trend.points.length, 2);
  assert.equal(trend.periodsWithData, 1);
  assert.equal(pointAt(trend, "2026-04").hasData, false);
});

test("整段区间都没有账时 periodsWithData 为 0，前端据此整块留白", () => {
  const trend = buildChairmanTrend({ endPeriod: "2026-05", months: 6, ledgerEntries: [] });

  assert.equal(trend.periodsWithData, 0);
  assert.equal(trend.points.length, 6);
  assert.ok(trend.points.every((point) => !point.hasData && point.revenue === null));
});

test("trailingPeriodLabels 升序返回连续期间并正确跨年", () => {
  assert.deepEqual(trailingPeriodLabels("2026-05", 6), [
    "2025-12",
    "2026-01",
    "2026-02",
    "2026-03",
    "2026-04",
    "2026-05"
  ]);
  assert.deepEqual(trailingPeriodLabels("2026-01", 2), ["2025-12", "2026-01"]);
  assert.deepEqual(trailingPeriodLabels("2026-05", 1), ["2026-05"]);
});

test("resolveTrendMonths 缺省 6、越界钳住、非法回落", () => {
  assert.equal(resolveTrendMonths(null), DEFAULT_TREND_MONTHS);
  assert.equal(resolveTrendMonths("12"), 12);
  assert.equal(resolveTrendMonths("0"), MIN_TREND_MONTHS);
  assert.equal(resolveTrendMonths("-3"), MIN_TREND_MONTHS);
  assert.equal(resolveTrendMonths("999"), MAX_TREND_MONTHS);
  for (const raw of ["", "  ", "abc", "六"]) {
    assert.equal(resolveTrendMonths(raw), DEFAULT_TREND_MONTHS, `期望回落：${JSON.stringify(raw)}`);
  }
});
