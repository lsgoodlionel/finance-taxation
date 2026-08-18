/**
 * 付款中心展示逻辑的测试（V13-C7）。
 */

import { describeProgress, groupDueByCounterparty, remainingCents } from "./payment-view";
import type { ContractPaymentProgress, DuePaymentRow } from "../../lib/api-expense-control";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const BASE_PROGRESS: ContractPaymentProgress = {
  totalCents: 1000000,
  paidCents: 0,
  unpaidCents: 900000,
  retentionCents: 100000,
  isFullyPaid: false,
  isMainPaid: false,
};

// 没有付款计划时说清楚，而不是显示「待付 0.00 元」
assert(
  describeProgress({ ...BASE_PROGRESS, totalCents: 0 }) === "尚未录入付款计划",
  "expected empty schedule to be stated explicitly"
);

// 「主体已付清、质保金待释放」必须能说出来——这是质保金做成独立一期的
// 全部意义。只说「已付 90%」会让人以为还差一笔正常的款没付。
const mainPaid = describeProgress({
  ...BASE_PROGRESS,
  paidCents: 900000,
  unpaidCents: 0,
  isMainPaid: true,
});
assert(mainPaid.includes("主体款项已付清"), "expected main-paid state to be described");
assert(mainPaid.includes("1000.00"), "expected retention amount in description");

// 全部付清
assert(
  describeProgress({
    ...BASE_PROGRESS,
    paidCents: 1000000,
    unpaidCents: 0,
    retentionCents: 0,
    isFullyPaid: true,
    isMainPaid: true,
  }) === "已全部付清",
  "expected fully paid description"
);

// 还没付时，待付与质保金分开说——混在一起会让出纳以为质保金现在就该付
const pending = describeProgress(BASE_PROGRESS);
assert(pending.includes("待付 9000.00"), "expected unpaid amount");
assert(pending.includes("质保金 1000.00"), "expected retention listed separately");

// 没有质保金的合同不提质保金
const noRetention = describeProgress({ ...BASE_PROGRESS, retentionCents: 0 });
assert(!noRetention.includes("质保金"), "expected no retention mention when there is none");

const DUE: DuePaymentRow[] = [
  {
    scheduleId: "s1",
    contractId: "c1",
    contractNo: "HT-001",
    counterpartyName: "甲供应商",
    periodNo: 1,
    title: "首付款",
    dueDate: "2026-09-30",
    amountCents: 600000,
    paidCents: 100000,
    scheduleType: "normal",
  },
  {
    scheduleId: "s2",
    contractId: "c1",
    contractNo: "HT-001",
    counterpartyName: "甲供应商",
    periodNo: 2,
    title: "尾款",
    dueDate: "2026-09-30",
    amountCents: 300000,
    paidCents: 0,
    scheduleType: "normal",
  },
  {
    scheduleId: "s3",
    contractId: "c2",
    contractNo: "HT-002",
    counterpartyName: "乙供应商",
    periodNo: 1,
    title: "全款",
    dueDate: "2026-09-15",
    amountCents: 200000,
    paidCents: 0,
    scheduleType: "normal",
  },
];

// 剩余金额而不是期次金额——已付一部分的期次只该显示还差的那部分
assert(remainingCents(DUE[0]!) === 500000, "expected remaining to exclude paid part");

// 按对方分组：出纳的实际操作是「今天给这家转一笔」，不是逐期转
const grouped = groupDueByCounterparty(DUE);
assert(grouped.length === 2, "expected two counterparties");
assert(grouped[0]!.counterpartyName === "甲供应商", "expected largest first");
assert(grouped[0]!.totalCents === 800000, "expected 500000 + 300000");
assert(grouped[0]!.count === 2, "expected two schedules for 甲供应商");
assert(grouped[1]!.totalCents === 200000, "expected 乙供应商 total");

// 空列表不抛错
assert(groupDueByCounterparty([]).length === 0, "expected empty grouping");

console.log("payment-view-ok");
