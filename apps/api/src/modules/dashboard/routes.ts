import type { ServerResponse } from "node:http";
import type { BusinessEvent, Task, Voucher } from "@finance-taxation/domain-model";
import { json } from "../../utils/http.js";
import type { ApiRequest } from "../../types.js";
import { readJson } from "../../services/jsonStore.js";

const eventsFile = new URL("../../data/events.v2.json", import.meta.url);
const tasksFile = new URL("../../data/tasks.v2.json", import.meta.url);
const vouchersFile = new URL("../../data/vouchers.v2.json", import.meta.url);
const ledgerEntriesFile = new URL("../../data/ledger-entries.v2.json", import.meta.url);

interface LedgerEntry {
  companyId: string;
  accountCode: string;
  debit: string;
  credit: string;
}

function sumAccountBalance(entries: LedgerEntry[], accountPrefix: string): number {
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

  const [events, tasks, vouchers, ledgerEntries] = await Promise.all([
    readJson<BusinessEvent[]>(eventsFile, []),
    readJson<Task[]>(tasksFile, []),
    readJson<Voucher[]>(vouchersFile, []),
    readJson<LedgerEntry[]>(ledgerEntriesFile, [])
  ]);

  const companyEntries = ledgerEntries.filter((e) => e.companyId === companyId);
  const companyEvents = events.filter((e) => e.companyId === companyId);
  const companyTasks = tasks.filter((t) => t.companyId === companyId);
  const companyVouchers = vouchers.filter((v) => v.companyId === companyId);

  // 可动用资金：银行存款余额（1002 debit方向，余额=借方-贷方）
  const cashBalance = sumAccountBalance(companyEntries, "1002");

  // 待回款金额：应收账款余额（1122 debit方向）
  const receivablesBalance = sumAccountBalance(companyEntries, "1122");

  // 本月预计税负：应交税费贷方余额（2221，贷方>借方则有税负）
  const taxLiability = -sumAccountBalance(companyEntries, "2221");

  // 高风险事项：blocked 或 analyzed 状态的事项数
  const riskEvents = companyEvents.filter((e) =>
    e.status === "blocked" || (e.status === "analyzed" && !e.updatedAt?.startsWith(currentMonth))
  ).length;

  // 待审批凭证数
  const pendingApprovals = companyVouchers.filter((v) => v.status === "review_required").length;

  // 阻塞任务数
  const blockedTasks = companyTasks.filter((t) => t.status === "blocked").length;

  // 逾期任务数
  const overdueTasks = companyTasks.filter(
    (t) => t.dueAt && new Date(t.dueAt).getTime() < now && t.status !== "done" && t.status !== "cancelled"
  ).length;

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
    queues: {
      approvals: pendingApprovals,
      blockedTasks,
      overdueTasks
    }
  });
}
