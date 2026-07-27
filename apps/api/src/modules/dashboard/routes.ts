import type { ServerResponse } from "node:http";
import type { LedgerEntry } from "@finance-taxation/domain-model";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { listCompanyEvents, listCompanyTasks } from "../events/routes.js";
import { listCompanyRiskFindings } from "../risk/routes.js";
import { listCompanyTaxFilingBatches } from "../tax/routes.js";
import { listCompanyLedgerEntries, listCompanyVouchers } from "../vouchers/routes.js";
import {
  formatAmount,
  formatBalanceTrend,
  NO_TREND_AVAILABLE,
  previousPeriodEndDate
} from "./kpi.js";
import { buildDashboardSnapshot, type DashboardPeriod } from "./summary.js";

const PERIOD_LABEL = /^\d{4}-\d{2}$/;

function sumAccountBalance(
  entries: Array<{ accountCode: string; debit: string; credit: string }>,
  accountPrefix: string
): number {
  return entries
    .filter((e) => e.accountCode.startsWith(accountPrefix))
    .reduce((acc, e) => acc + Number(e.debit || 0) - Number(e.credit || 0), 0);
}

/**
 * 解析驾驶舱的会计期间：`?period=YYYY-MM`，缺省取当前自然月（UTC，与
 * modules/reports/routes.ts 的 resolvePeriod 默认值保持一致）。
 * 非法取值一律回落到当前期间，保证首页永远有数可看。
 */
export function resolveDashboardPeriod(rawPeriod: string | null, now: Date): DashboardPeriod & { label: string } {
  const label =
    rawPeriod && PERIOD_LABEL.test(rawPeriod) ? rawPeriod : now.toISOString().slice(0, 7);
  const year = Number(label.slice(0, 4));
  const month = Number(label.slice(5, 7));
  return {
    label,
    startDate: `${label}-01`,
    endDate: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
  };
}

/** 余额类科目（货币资金、应收、应交税费）按「期末时点」取数，而非期间发生额。 */
function entriesAsOf(entries: LedgerEntry[], asOfDate: string): LedgerEntry[] {
  return entries.filter((entry) => entry.entryDate <= asOfDate);
}

export async function handleChairmanDashboard(req: ApiRequest, res: ServerResponse) {
  const companyId = req.auth!.companyId;
  const now = new Date();
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const period = resolveDashboardPeriod(url.searchParams.get("period"), now);

  const [events, tasks, vouchers, ledgerEntries, taxFilingBatches, riskFindings] = await Promise.all([
    listCompanyEvents(companyId),
    listCompanyTasks(companyId),
    listCompanyVouchers(companyId),
    listCompanyLedgerEntries(companyId),
    listCompanyTaxFilingBatches(companyId),
    listCompanyRiskFindings(companyId)
  ]);

  const companyEntries = ledgerEntries.filter((e) => e.companyId === companyId);
  const companyEvents = events.filter((e) => e.companyId === companyId);
  const companyTasks = tasks.filter((t) => t.companyId === companyId);
  const companyVouchers = vouchers.filter((v) => v.companyId === companyId);

  const asOfEntries = entriesAsOf(companyEntries, period.endDate);
  const cashBalance = sumAccountBalance(asOfEntries, "1002");
  const receivablesBalance = sumAccountBalance(asOfEntries, "1122");
  const taxLiability = -sumAccountBalance(asOfEntries, "2221");

  // 真环比：同一套取数函数按「上期期末」再跑一次。上期完全没有分录（公司首个
  // 有账期间）时取 null，卡片降级为「无上期数据」而不是编一个增长出来。
  const priorEntries = entriesAsOf(companyEntries, previousPeriodEndDate(period.label));
  const hasPriorData = priorEntries.length > 0;
  const priorCashBalance = hasPriorData ? sumAccountBalance(priorEntries, "1002") : null;
  const priorReceivablesBalance = hasPriorData ? sumAccountBalance(priorEntries, "1122") : null;
  const priorTaxLiability = hasPriorData ? -sumAccountBalance(priorEntries, "2221") : null;

  // riskCount 直接取风险引擎的未关闭发现数（与 /api/risk/findings、/risk 页的
  // 「待处理」口径一致）。此前统计的是 business_events 中 blocked/陈旧 analyzed
  // 的条数，从未调用风险引擎，与 /risk 页数字对不上。
  const openRiskCount = riskFindings.filter((finding) => finding.status === "open").length;

  const snapshot = buildDashboardSnapshot({
    now: now.toISOString(),
    period,
    events: companyEvents,
    tasks: companyTasks,
    vouchers: companyVouchers,
    ledgerEntries: companyEntries,
    taxFilingBatches
  });

  const hasLedgerData = asOfEntries.length > 0;

  return json(res, 200, {
    period: period.label,
    periodStartDate: period.startDate,
    periodEndDate: period.endDate,
    cards: [
      {
        key: "cash",
        label: "可动用资金",
        value: hasLedgerData ? formatAmount(cashBalance) : "—",
        trend: hasLedgerData ? formatBalanceTrend(cashBalance, priorCashBalance) : "暂无数据"
      },
      {
        key: "receivables",
        label: "待回款金额",
        value: hasLedgerData ? formatAmount(receivablesBalance) : "—",
        trend: hasLedgerData
          ? formatBalanceTrend(receivablesBalance, priorReceivablesBalance)
          : "暂无数据"
      },
      {
        key: "tax",
        label: "本月预计税负",
        value: hasLedgerData ? formatAmount(taxLiability) : "—",
        trend: hasLedgerData ? formatBalanceTrend(taxLiability, priorTaxLiability) : "暂无数据"
      },
      {
        // 风险卡片没有环比：risk_findings.status 只有「当前状态」，没有历史快照，
        // 无法还原「上期期末未关闭数」。与其编一个 `+2`（旧实现就是把当前计数
        // 加个加号），不如明确留白。
        key: "risk",
        label: "高风险事项",
        value: String(openRiskCount),
        trend: NO_TREND_AVAILABLE
      }
    ],
    queues: snapshot.queues,
    profitOverview: snapshot.profitOverview,
    riskBoard: snapshot.riskBoard,
    aiSummary: snapshot.aiSummary,
    riskCount: openRiskCount
  });
}
