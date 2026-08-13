/**
 * 资产负债表的跨年利润切分（V12 蓝图 E6）。
 *
 * ## 修的是什么
 *
 * 「本年利润」行此前显示的是**开业至今的累计利润**——只要漏做年末结转，
 * 3131 上历年结转进来的利润就一直躺着，报表把它们全算成今年赚的。
 * 数字看着合理，只是把三年的利润当成了一年的，而这恰恰是最难靠肉眼发现的错。
 *
 * ## 不变式
 *
 * 重分类只在权益内部发生：从「本年利润」挪走多少，「利润分配」就增加多少。
 * 权益合计分文不动，`资产 = 负债 + 权益` 不受影响。每个用例都验这一条。
 */

import test from "node:test";
import assert from "node:assert/strict";
import type { LedgerEntry } from "@finance-taxation/domain-model";
import { buildBalanceSheetReport, resolveProfitSplit } from "./summary.js";

function entry(
  overrides: Partial<LedgerEntry> & Pick<LedgerEntry, "id" | "accountCode" | "entryDate">
): LedgerEntry {
  return {
    companyId: "cmp-1",
    voucherId: "vch-1",
    businessEventId: "evt-1",
    summary: "测试分录",
    accountName: overrides.accountCode,
    debit: "0.00",
    credit: "0.00",
    source: "voucher_posting",
    postedAt: `${overrides.entryDate}T00:00:00.000Z`,
    ...overrides
  };
}

function equityOf(report: ReturnType<typeof buildBalanceSheetReport>, code: string): number {
  return Number(report.equity.find((line) => line.code === code)?.amount ?? 0);
}

function equityTotal(report: ReturnType<typeof buildBalanceSheetReport>): number {
  return Number(report.totals.equity);
}

test("往年已结转的利润归入利润分配，不算进本年利润", () => {
  // 2025 年赚了 10 万并做过月结（结转进 3131），但没做年结；
  // 2026 年赚了 3 万，尚未结转。
  const entries: LedgerEntry[] = [
    // 2025 年的收入与其结转
    entry({ id: "e1", accountCode: "1002", entryDate: "2025-06-01", debit: "100000.00" }),
    entry({ id: "e2", accountCode: "6001", entryDate: "2025-06-01", credit: "100000.00" }),
    entry({
      id: "e3",
      accountCode: "6001",
      entryDate: "2025-12-31",
      debit: "100000.00",
      source: "period_closing"
    }),
    entry({
      id: "e4",
      accountCode: "4103",
      entryDate: "2025-12-31",
      credit: "100000.00",
      source: "period_closing"
    }),
    // 2026 年的收入，尚未结转
    entry({ id: "e5", accountCode: "1002", entryDate: "2026-03-01", debit: "30000.00" }),
    entry({ id: "e6", accountCode: "6001", entryDate: "2026-03-01", credit: "30000.00" })
  ];

  const report = buildBalanceSheetReport({
    periodLabel: "2026-06",
    asOfDate: "2026-06-30",
    entries
  });

  assert.equal(equityOf(report, "4103"), 30000, "本年利润只含 2026 年的 3 万");
  assert.equal(equityOf(report, "4104"), 100000, "2025 年的 10 万归入利润分配");
  assert.equal(equityTotal(report), 130000, "权益合计不变——重分类只在权益内部发生");
});

test("往年连月结都没做时，未结转的往年损益同样归入利润分配", () => {
  // 只切 3131 账面余额是不够的：一家从没做过月结的公司，往年利润还留在 6xxx 上
  const entries: LedgerEntry[] = [
    entry({ id: "e1", accountCode: "1002", entryDate: "2025-06-01", debit: "80000.00" }),
    entry({ id: "e2", accountCode: "6001", entryDate: "2025-06-01", credit: "80000.00" }),
    entry({ id: "e3", accountCode: "1002", entryDate: "2026-03-01", debit: "20000.00" }),
    entry({ id: "e4", accountCode: "6001", entryDate: "2026-03-01", credit: "20000.00" })
  ];

  const report = buildBalanceSheetReport({
    periodLabel: "2026-06",
    asOfDate: "2026-06-30",
    entries
  });

  assert.equal(equityOf(report, "4103"), 20000, "本年利润只含 2026 年的 2 万");
  assert.equal(equityOf(report, "4104"), 80000, "2025 年未结转的 8 万也归以前年度");
  assert.equal(equityTotal(report), 100000);
});

test("做过年结时行为不变——年结凭证已经把利润转进 3141", () => {
  const entries: LedgerEntry[] = [
    entry({ id: "e1", accountCode: "1002", entryDate: "2025-06-01", debit: "50000.00" }),
    entry({ id: "e2", accountCode: "6001", entryDate: "2025-06-01", credit: "50000.00" }),
    entry({ id: "e3", accountCode: "6001", entryDate: "2025-12-31", debit: "50000.00", source: "period_closing" }),
    entry({ id: "e4", accountCode: "4103", entryDate: "2025-12-31", credit: "50000.00", source: "period_closing" }),
    // 年结：借 3131 / 贷 3141
    entry({ id: "e5", accountCode: "4103", entryDate: "2025-12-31", debit: "50000.00", source: "annual_closing" }),
    entry({ id: "e6", accountCode: "4104", entryDate: "2025-12-31", credit: "50000.00", source: "annual_closing" })
  ];

  const report = buildBalanceSheetReport({
    periodLabel: "2026-06",
    asOfDate: "2026-06-30",
    entries
  });

  assert.equal(equityOf(report, "4103"), 0, "年结已把 3131 清零，重分类无事可做");
  assert.equal(equityOf(report, "4104"), 50000);
  assert.equal(equityTotal(report), 50000, "两条路线并存，不会互相重复计量");
});

test("只有本年数据时，利润分配不凭空出现", () => {
  const entries: LedgerEntry[] = [
    entry({ id: "e1", accountCode: "1002", entryDate: "2026-03-01", debit: "10000.00" }),
    entry({ id: "e2", accountCode: "6001", entryDate: "2026-03-01", credit: "10000.00" })
  ];

  const report = buildBalanceSheetReport({
    periodLabel: "2026-06",
    asOfDate: "2026-06-30",
    entries
  });

  assert.equal(equityOf(report, "4103"), 10000);
  assert.equal(
    report.equity.find((line) => line.code === "4104"),
    undefined,
    "没有以前年度利润时不该多出一行 0 的利润分配"
  );
});

test("往年亏损同样归以前年度，不冲减本年利润", () => {
  const entries: LedgerEntry[] = [
    // 2025 年亏 4 万
    entry({ id: "e1", accountCode: "6401", entryDate: "2025-06-01", debit: "40000.00" }),
    entry({ id: "e2", accountCode: "1002", entryDate: "2025-06-01", credit: "40000.00" }),
    // 2026 年赚 6 万
    entry({ id: "e3", accountCode: "1002", entryDate: "2026-03-01", debit: "60000.00" }),
    entry({ id: "e4", accountCode: "6001", entryDate: "2026-03-01", credit: "60000.00" })
  ];

  const report = buildBalanceSheetReport({
    periodLabel: "2026-06",
    asOfDate: "2026-06-30",
    entries
  });

  assert.equal(equityOf(report, "4103"), 60000, "本年赚的 6 万不被往年亏损冲减");
  assert.equal(equityOf(report, "4104"), -40000, "往年亏损如实以负数列示");
  assert.equal(equityTotal(report), 20000);
});

test("跨年边界：12-31 属于上年，01-01 属于本年", () => {
  const split = (entryDate: string) =>
    resolveProfitSplit({
      asOfDate: "2026-06-30",
      asOfEntries: [
        entry({ id: "e1", accountCode: "6001", entryDate, credit: "1000.00" }),
        entry({ id: "e2", accountCode: "1002", entryDate, debit: "1000.00" })
      ],
      profitAccountBalance: 0,
      retainedAccountBalance: 0,
      unclosedProfit: 1000
    });

  assert.equal(split("2025-12-31").retained, 1000, "上年最后一天归以前年度");
  assert.equal(split("2025-12-31").currentYear, 0);
  assert.equal(split("2026-01-01").retained, 0, "本年第一天归本年");
  assert.equal(
    split("2026-01-01").currentYear,
    1000,
    "日期比较必须是纯字符串——经 Date 往返会在非 UTC 时区把 1 月 1 日前移一天"
  );
});

test("切分不改变两行之和——这是权益不变的根据", () => {
  const cases = [
    { profit: 100000, retained: 0, unclosed: 30000 },
    { profit: 0, retained: 50000, unclosed: -20000 },
    { profit: -30000, retained: 80000, unclosed: 0 }
  ];

  for (const item of cases) {
    const split = resolveProfitSplit({
      asOfDate: "2026-06-30",
      asOfEntries: [],
      profitAccountBalance: item.profit,
      retainedAccountBalance: item.retained,
      unclosedProfit: item.unclosed
    });
    assert.equal(
      split.currentYear + split.retained,
      item.profit + item.retained + item.unclosed,
      `切分前后两行之和必须相等：${JSON.stringify(item)}`
    );
  }
});
