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
import { isPeriodLabel, periodBounds } from "./period.js";
import { buildDashboardSnapshot, type DashboardPeriod } from "./summary.js";
import { buildChairmanTrend, resolveTrendMonths } from "./trend.js";

/**
 * 余额卡片取数 —— **不排除结转损益分录**（口径见 ledger/closing-entries.ts）。
 *
 * 判断依据有二：其一，这是「截至期末的时点余额」而非「期间经营成果」，账簿余额
 * 必须完整；其二，本函数只被 1002 / 1122 / 2221 三个前缀调用，而结转分录只涉及
 * 6xxx 与 3131，前缀根本不相交，排除与否结果相同。
 *
 * 注意本路由与 buildDashboardSnapshot 共用同一次 listCompanyLedgerEntries 取数：
 * 盈利概览需要排除结转分录、余额卡片不需要，因此过滤只能落在各自的消费点上，
 * 绝不能提到取数处统一过滤。
 */
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
  return periodBounds(isPeriodLabel(rawPeriod) ? rawPeriod : now.toISOString().slice(0, 7));
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

/**
 * `GET /api/dashboard/chairman/trend?months=6&period=YYYY-MM`
 *
 * 按会计期间聚合真实的历史收入/成本，供驾驶舱「公司赚不赚钱？」一段画趋势图。
 * 口径、留白规则与实现理由都在 dashboard/trend.ts 的抬头。
 *
 * `period` 缺省取当前自然月，即最后一个点就是驾驶舱主接口的当期——两个接口共用
 * resolveDashboardPeriod，图上最后一个点与利润概览卡片说的是同一个月。
 *
 * 取全量分录后在内存里按期聚合，而不是写一句 `group by to_char(entry_date,…)`：
 * 收入/成本/费用的科目口径在 reports/profit-accounts.ts（还要查科目主数据的 category），
 * 搬进 SQL 就等于把那套分类再实现一遍，而它正是「驾驶舱与 /reports 对不上」的病根。
 * 数据量与本文件的主接口同级（两者都要全表扫一遍公司分录）。
 */
export async function handleChairmanTrend(req: ApiRequest, res: ServerResponse) {
  const companyId = req.auth!.companyId;
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const period = resolveDashboardPeriod(url.searchParams.get("period"), new Date());
  const months = resolveTrendMonths(url.searchParams.get("months"));

  const ledgerEntries = await listCompanyLedgerEntries(companyId);

  const trend = buildChairmanTrend({
    endPeriod: period.label,
    months,
    ledgerEntries: ledgerEntries.filter((entry) => entry.companyId === companyId)
  });

  return json(res, 200, trend);
}
