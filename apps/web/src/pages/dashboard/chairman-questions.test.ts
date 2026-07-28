import type { DashboardCard, DashboardData } from "../../lib/api";
import { buildChairmanQuestions, type ChairmanQuestionKey } from "./chairman-questions";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function makeCards(overrides: Partial<Record<string, string>> = {}): DashboardCard[] {
  return [
    { key: "cash", label: "可动用资金", value: overrides.cash ?? "820,000", trend: "+1,300" },
    { key: "receivables", label: "待回款金额", value: overrides.receivables ?? "150,000", trend: "-500" },
    { key: "tax", label: "本月预计税负", value: overrides.tax ?? "42,000", trend: "持平" },
    { key: "risk", label: "高风险事项", value: overrides.risk ?? "2", trend: "—" }
  ];
}

function makeData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    cards: makeCards(),
    queues: { approvals: 0, blockedTasks: 0, overdueTasks: 0 },
    profitOverview: {
      revenue: "1000000", cost: "600000", expense: "200000", incomeTax: "50000",
      grossProfit: "400000", netProfit: "150000", grossMargin: "40%", netMargin: "15%"
    },
    riskBoard: { approvals: [], blockedTasks: [], overdueTasks: [], riskEvents: [] },
    aiSummary: { date: "2026-06-30", newEvents: 0, postedVouchers: 0, pendingTaxBatches: 0, highlights: [] },
    riskCount: 0,
    ...overrides
  };
}

function answerOf(data: DashboardData, key: ChairmanQuestionKey): string {
  return buildChairmanQuestions(data).find((question) => question.key === key)?.answer ?? "";
}

function toneOf(data: DashboardData, key: ChairmanQuestionKey): string {
  return buildChairmanQuestions(data).find((question) => question.key === key)?.tone ?? "";
}

// ── 三段的顺序就是副标题承诺的顺序，且都是问句 ──────────────────────────────

{
  const questions = buildChairmanQuestions(makeData());
  assert(questions.length === 3, "驾驶舱恰好三问");
  assert(
    questions.map((question) => question.key).join(",") === "profit,cash,decisions",
    "顺序必须是「赚不赚钱 → 钱够不够用 → 有没有事要我拍板」"
  );
  assert(questions.every((question) => question.heading.endsWith("？")), "段标题用问句，段落存在的理由就是回答它");
  assert(questions.every((question) => question.answer.length > 0), "每一问都要先给一句结论");
}

// ── 结论只由真实字段推出；后端给不出数就说「算不出」，不能当 0 ────────────────

{
  const noLedger = makeData({
    cards: makeCards({ cash: "—", receivables: "—", tax: "—" }),
    profitOverview: {
      revenue: "—", cost: "—", expense: "—", incomeTax: "—",
      grossProfit: "—", netProfit: "—", grossMargin: "—", netMargin: "—"
    }
  });

  assert(answerOf(noLedger, "profit").includes("算不出盈亏"), "没有账务数据时如实说算不出");
  assert(toneOf(noLedger, "profit") === "unknown", "算不出不是「没问题」，语气必须是 unknown");
  assert(answerOf(noLedger, "cash").includes("算不出可动用资金"), "资金同理");
  assert(toneOf(noLedger, "cash") === "unknown", "资金算不出时不得给绿色的安心暗示");
  assert(!answerOf(noLedger, "profit").includes("¥0"), "绝不能把「没数据」渲染成 0 元");
}

{
  const profitable = makeData();
  assert(answerOf(profitable, "profit").includes("本期净利 ¥150,000"), "盈利结论取自 netProfit");
  assert(answerOf(profitable, "profit").includes("净利率 15%"), "净利率取自 netMargin");
  assert(toneOf(profitable, "profit") === "good", "盈利 → good");
}

{
  const loss = makeData({
    profitOverview: {
      revenue: "1000000", cost: "900000", expense: "300000", incomeTax: "0",
      grossProfit: "100000", netProfit: "-200000", grossMargin: "10%", netMargin: "-20%"
    }
  });
  assert(answerOf(loss, "profit").includes("本期亏损 ¥200,000"), "亏损要说「亏损」，不能显示成负的净利");
  assert(toneOf(loss, "profit") === "warn", "亏损 → warn");
}

{
  const cash = makeData();
  assert(answerOf(cash, "cash").includes("账上可动用 ¥820,000"), "资金结论取自 cash 卡");
  assert(answerOf(cash, "cash").includes("¥150,000 待回款"), "待回款取自 receivables 卡");
}

// ── 待办不相加：一个风险发现完全可能同时是一条阻塞任务 ───────────────────────

{
  const busy = makeData({
    queues: { approvals: 3, blockedTasks: 2, overdueTasks: 1 },
    riskCount: 4
  });
  const answer = answerOf(busy, "decisions");
  assert(answer.includes("3 张凭证等您审批"), "待审批数取自 queues.approvals");
  assert(answer.includes("2 项任务卡住了"), "阻塞数取自 queues.blockedTasks");
  assert(answer.includes("1 项任务已逾期"), "逾期数取自 queues.overdueTasks");
  assert(answer.includes("4 个高风险事项待处理"), "风险数取自 riskCount");
  assert(!answer.includes("10"), "四个队列不得相加成一个总数：同一件事会被数两遍");
  assert(toneOf(busy, "decisions") === "warn", "有事要拍板 → warn");
}

{
  const idle = makeData();
  assert(answerOf(idle, "decisions") === "目前没有需要您拍板的事。", "全为 0 时给一句明确的「没有」");
  assert(toneOf(idle, "decisions") === "good", "没有待办 → good");
}

{
  // 只有一类待办时不应带出别的类别的空话。
  const onlyApprovals = makeData({ queues: { approvals: 1, blockedTasks: 0, overdueTasks: 0 } });
  const answer = answerOf(onlyApprovals, "decisions");
  assert(answer === "1 张凭证等您审批。", `只列真实存在的待办，实际得到：${answer}`);
}
