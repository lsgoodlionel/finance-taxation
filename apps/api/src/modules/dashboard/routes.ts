import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { listCompanyEvents, listCompanyTasks } from "../events/routes.js";
import { listCompanyTaxFilingBatches } from "../tax/routes.js";
import { listCompanyLedgerEntries, listCompanyVouchers } from "../vouchers/routes.js";
import { buildDashboardSnapshot } from "./summary.js";

function sumAccountBalance(
  entries: Array<{ accountCode: string; debit: string; credit: string }>,
  accountPrefix: string
): number {
  return entries
    .filter((e) => e.accountCode.startsWith(accountPrefix))
    .reduce((acc, e) => acc + Number(e.debit || 0) - Number(e.credit || 0), 0);
}

function formatAmount(value: number): string {
  return Math.abs(value).toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function trendSign(value: number): string {
  return value >= 0 ? `+${formatAmount(value)}` : `-${formatAmount(Math.abs(value))}`;
}

export async function handleChairmanDashboard(req: ApiRequest, res: ServerResponse) {
  const companyId = req.auth!.companyId;
  const now = Date.now();
  const currentMonth = new Date().toISOString().slice(0, 7);

  const [events, tasks, vouchers, ledgerEntries, taxFilingBatches] = await Promise.all([
    listCompanyEvents(companyId),
    listCompanyTasks(companyId),
    listCompanyVouchers(companyId),
    listCompanyLedgerEntries(companyId),
    listCompanyTaxFilingBatches(companyId)
  ]);

  const companyEntries = ledgerEntries.filter((e) => e.companyId === companyId);
  const companyEvents = events.filter((e) => e.companyId === companyId);
  const companyTasks = tasks.filter((t) => t.companyId === companyId);
  const companyVouchers = vouchers.filter((v) => v.companyId === companyId);

  const cashBalance = sumAccountBalance(companyEntries, "1002");
  const receivablesBalance = sumAccountBalance(companyEntries, "1122");
  const taxLiability = -sumAccountBalance(companyEntries, "2221");

  const riskEvents = companyEvents.filter((e) =>
    e.status === "blocked" || (e.status === "analyzed" && !e.updatedAt?.startsWith(currentMonth))
  ).length;

  const snapshot = buildDashboardSnapshot({
    now: new Date(now).toISOString(),
    events: companyEvents,
    tasks: companyTasks,
    vouchers: companyVouchers,
    ledgerEntries: companyEntries,
    taxFilingBatches
  });

  const hasLedgerData = companyEntries.length > 0;

  return json(res, 200, {
    cards: [
      {
        key: "cash",
        label: "可动用资金",
        value: hasLedgerData ? formatAmount(cashBalance) : "—",
        trend: hasLedgerData ? trendSign(cashBalance) : "暂无数据"
      },
      {
        key: "receivables",
        label: "待回款金额",
        value: hasLedgerData ? formatAmount(receivablesBalance) : "—",
        trend: hasLedgerData ? trendSign(receivablesBalance) : "暂无数据"
      },
      {
        key: "tax",
        label: "本月预计税负",
        value: hasLedgerData ? formatAmount(taxLiability) : "—",
        trend: hasLedgerData ? trendSign(taxLiability) : "暂无数据"
      },
      {
        key: "risk",
        label: "高风险事项",
        value: String(riskEvents),
        trend: riskEvents > 0 ? `+${riskEvents}` : "0"
      }
    ],
    queues: snapshot.queues,
    profitOverview: snapshot.profitOverview,
    riskBoard: snapshot.riskBoard,
    aiSummary: snapshot.aiSummary,
    riskCount: riskEvents
  });
}
