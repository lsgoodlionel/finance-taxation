import type { CashForecast, CloseDraft, InboxItem } from "../../lib/api";
import {
  buildPendingCards,
  describeRunway,
  estimateCashRunway,
  profitTone,
  riskTone,
  runwayTone,
  sumDraftAmount,
  takeTopPending
} from "./home-helpers";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function makeForecast(overrides: Partial<CashForecast>): CashForecast {
  return {
    cashBalance: 100000,
    expectedInflow: 20000,
    expectedOutflow: 40000,
    projectedBalance: 80000,
    salaryNeed: 30000,
    canPaySalary: true,
    gap: 0,
    verdict: "ok",
    ...overrides
  };
}

// ── runway 估算口径 ──────────────────────────────────────────────────────────

// 月净流出 2 万，现金 10 万 → 5 个月
const fiveMonths = estimateCashRunway(makeForecast({}));
assert(fiveMonths.kind === "months" && fiveMonths.months === 5, "expected runway of 5 months");

// 保留 1 位小数：现金 10 万 / 净流出 3 万 → 3.3 个月
const oneDecimal = estimateCashRunway(makeForecast({ expectedOutflow: 50000 }));
assert(oneDecimal.kind === "months" && oneDecimal.months === 3.3, "expected runway rounded to 1 decimal");

// 净流出 ≤ 0（进的比出的多）→ 现金充足
assertEqual(estimateCashRunway(makeForecast({ expectedInflow: 50000 })).kind, "ample", "expected ample when net inflow");

// 现金为 0 但仍在净流出 → 0 个月（红灯）
const empty = estimateCashRunway(makeForecast({ cashBalance: 0 }));
assert(empty.kind === "months" && empty.months === 0, "expected zero runway when no cash");

// 数据缺失 → unknown
assertEqual(estimateCashRunway(null).kind, "unknown", "expected unknown without forecast");
assertEqual(
  estimateCashRunway(makeForecast({ cashBalance: Number.NaN })).kind,
  "unknown",
  "expected unknown with invalid numbers"
);

// ── tone 映射 ────────────────────────────────────────────────────────────────

assertEqual(runwayTone({ kind: "ample" }), "good", "ample should be green");
assertEqual(runwayTone({ kind: "months", months: 8 }), "good", ">=6 months should be green");
assertEqual(runwayTone({ kind: "months", months: 4 }), "warn", "3-6 months should be yellow");
assertEqual(runwayTone({ kind: "months", months: 1.5 }), "bad", "<3 months should be red");
assertEqual(runwayTone({ kind: "unknown" }), "neutral", "unknown should be neutral");

assertEqual(riskTone(0), "good", "0 risks should be green");
assertEqual(riskTone(2), "warn", "1-2 risks should be yellow");
assertEqual(riskTone(3), "bad", ">=3 risks should be red");

assertEqual(profitTone("120,000.00", "15.0%"), "good", "profitable + healthy margin should be green");
assertEqual(profitTone("-3,200.00", "-2.0%"), "bad", "loss should be red");
assertEqual(profitTone("0.00", "0.0%"), "warn", "break-even should be yellow");
assertEqual(profitTone("abc", "1%"), "neutral", "unparseable profit should be neutral");

// ── runway 白话文案 ──────────────────────────────────────────────────────────

assert(describeRunway({ kind: "ample" }).value === "现金充足", "expected ample plain wording");
assert(describeRunway({ kind: "unknown" }).value === "暂无法估算", "expected unknown plain wording");
assert(describeRunway({ kind: "months", months: 5 }).value === "约 5 个月", "expected months plain wording");
assert(describeRunway({ kind: "months", months: 0 }).value === "0 个月", "expected zero months wording");

// ── 草稿金额合计（借方合计，字符串防御） ─────────────────────────────────────

function makeDraft(id: string, debits: string[]): CloseDraft {
  return {
    id,
    businessEventId: `evt-${id}`,
    voucherType: "记",
    summary: `测试草稿 ${id}`,
    proposalLevel: "auto",
    balanced: true,
    status: "draft",
    rationale: null,
    lines: debits.map((debit, idx) => ({
      id: `${id}-${idx}`,
      summary: "行",
      accountCode: "6602",
      accountName: "管理费用",
      debit,
      credit: "0"
    }))
  };
}

assertEqual(sumDraftAmount(makeDraft("a", ["5200.00", "0", "oops"])), 5200, "expected debit sum ignoring bad values");
assertEqual(sumDraftAmount(makeDraft("b", ["0", "0"])), null, "expected null amount when no positive debit");

// ── 待办卡优先级：高危 > AI 草稿 > 一般提醒；同级保持稳定顺序 ────────────────

const inboxItems: InboxItem[] = [
  { key: "tasks", label: "待办任务", count: 4, tone: "info", actionPath: "/tasks", hint: "有任务快到期" },
  { key: "risks", label: "高风险提醒", count: 2, tone: "warning", actionPath: "/risk", hint: "有勾稽异常" },
  { key: "empty", label: "空分类", count: 0, tone: "info", actionPath: "/audit", hint: "不应出现" }
];
const drafts = [makeDraft("d1", ["5200.00"]), makeDraft("d2", ["800.00"])];

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`expected item at index ${index}`);
  return item;
}

const cards = buildPendingCards(drafts, inboxItems);
assertEqual(cards.length, 4, "expected zero-count inbox categories to be dropped");
assertEqual(at(cards, 0).key, "inbox-risks", "expected warning inbox card first");
assertEqual(at(cards, 1).key, "draft-d1", "expected AI drafts after risks, in original order");
assertEqual(at(cards, 2).key, "draft-d2", "expected second draft to keep order");
assertEqual(at(cards, 3).key, "inbox-tasks", "expected info inbox card last");
assert(at(cards, 1).title.includes("5,200 元"), "expected draft card title with plain amount");
assert(at(cards, 1).draftId === "d1", "expected draft card to carry draftId");
assert(at(cards, 0).detailPath === "/risk", "expected inbox card to link to its action path");

// ── 前 3 张 + 剩余计数 ───────────────────────────────────────────────────────

const { top, remaining } = takeTopPending(cards);
assertEqual(top.length, 3, "expected top 3 cards");
assertEqual(remaining, 1, "expected 1 remaining card");
const few = takeTopPending(cards.slice(0, 2));
assertEqual(few.top.length, 2, "expected all cards when fewer than max");
assertEqual(few.remaining, 0, "expected no remaining when fewer than max");
