import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { CashForecast, DashboardData } from "../../lib/api";
import { HomePageView } from "./HomePageView";
import { HomePendingSection } from "./HomePendingSection";
import { HomeKpiSection } from "./HomeKpiSection";
import { HomeAskSection } from "./HomeAskSection";
import type { PendingCardModel } from "./home-helpers";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(createElement(MemoryRouter, null, node));
}

// ── HomePageView：三段式整页可独立渲染 ───────────────────────────────────────
const noop = () => undefined;
const pageHtml = render(
  createElement(HomePageView, {
    loading: true,
    error: null,
    pendingCards: [],
    pendingRemaining: 0,
    acting: null,
    dashboard: null,
    forecast: null,
    onApprove: noop,
    onReject: noop,
    onRetry: noop
  })
);
assert(pageHtml.includes("今天"), "expected home page header title");
assert(pageHtml.includes("需要您处理的事"), "expected pending section title");
assert(pageHtml.includes("公司现在怎么样"), "expected kpi section title");
assert(pageHtml.includes("想知道什么，直接问"), "expected ask section title");

// 整页错误态：友好文案 + 重试按钮
const errorHtml = render(
  createElement(HomePageView, {
    loading: false,
    error: "工作台数据加载失败，请检查网络后重试",
    pendingCards: [],
    pendingRemaining: 0,
    acting: null,
    dashboard: null,
    forecast: null,
    onApprove: noop,
    onReject: noop,
    onRetry: noop
  })
);
assert(errorHtml.includes("工作台数据加载失败"), "expected page-level error copy");
assert(errorHtml.includes("重新加载"), "expected retry button");

// ── 第一段：卡片 + 「还有 N 件 →」；空态给下一步建议 ─────────────────────────
const cards: PendingCardModel[] = [
  {
    key: "draft-d1",
    kind: "ai-draft",
    priority: 1,
    title: "AI 起草了一张 5,200 元的记账凭证，等您确认",
    impact: "确认后交财务复核入账，不会直接改动账本。",
    amount: 5200,
    detailPath: "/inbox",
    draftId: "d1"
  }
];
const pendingHtml = render(
  createElement(HomePendingSection, {
    loading: false,
    cards,
    remaining: 2,
    acting: null,
    onApprove: () => undefined,
    onReject: () => undefined
  })
);
assert(pendingHtml.includes("AI 起草了一张 5,200 元的记账凭证"), "expected pending card title");
assert(pendingHtml.includes("还有 2 件"), "expected remaining link");
assert(pendingHtml.includes('href="/inbox"'), "expected inbox link");

const emptyHtml = render(
  createElement(HomePendingSection, {
    loading: false,
    cards: [],
    remaining: 0,
    acting: null,
    onApprove: () => undefined,
    onReject: () => undefined
  })
);
assert(emptyHtml.includes("今天没有需要您处理的事"), "expected empty state title");
assert(emptyHtml.includes("看看经营报告"), "expected empty state next action");

// ── 第二段：4 张白话 KPI + 红绿灯下钻 ────────────────────────────────────────
const dashboard: DashboardData = {
  cards: [
    { key: "cash", label: "可动用资金", value: "100,000.00", trend: "+1%" },
    { key: "receivables", label: "待回款金额", value: "20,000.00", trend: "0" },
    { key: "tax", label: "本月预计税负", value: "8,600.00", trend: "+2%" },
    { key: "risk", label: "高风险事项", value: "1", trend: "+1" }
  ],
  queues: { approvals: 0, blockedTasks: 0, overdueTasks: 0 },
  profitOverview: {
    revenue: "300,000.00", cost: "150,000.00", expense: "30,000.00",
    grossProfit: "150,000.00", netProfit: "120,000.00", grossMargin: "50.0%", netMargin: "40.0%"
  },
  riskBoard: { approvals: [], blockedTasks: [], overdueTasks: [], riskEvents: [] },
  aiSummary: { date: "2026-07-15", newEvents: 1, postedVouchers: 2, pendingTaxBatches: 0, highlights: [] },
  riskCount: 1
};
const forecast: CashForecast = {
  cashBalance: 100000, expectedInflow: 20000, expectedOutflow: 40000,
  projectedBalance: 80000, salaryNeed: 30000, canPaySalary: true, gap: 0, verdict: "ok"
};
const kpiHtml = render(createElement(HomeKpiSection, { loading: false, dashboard, forecast }));
assert(kpiHtml.includes("现金还能撑多久"), "expected runway card");
assert(kpiHtml.includes("约 5 个月"), "expected runway estimate value");
assert(kpiHtml.includes("本月赚了多少"), "expected profit card");
assert(kpiHtml.includes("¥120,000.00"), "expected profit value");
assert(kpiHtml.includes("本月要交多少税"), "expected tax card");
assert(kpiHtml.includes("¥8,600.00"), "expected tax value");
assert(kpiHtml.includes("1 个风险"), "expected risk count wording");
assert(kpiHtml.includes('href="/risk"'), "expected risk drill-down link");
assert(kpiHtml.includes('href="/tax"'), "expected tax drill-down link");

// 数据缺失 → 白话降级文案
const kpiEmptyHtml = render(createElement(HomeKpiSection, { loading: false, dashboard: null, forecast: null }));
assert(kpiEmptyHtml.includes("经营数据暂时取不到"), "expected kpi fallback copy");

// ── 第三段：问 AI 输入框 + 4 张场景卡 ────────────────────────────────────────
const askHtml = render(createElement(HomeAskSection));
assert(askHtml.includes("这个月钱花哪了"), "expected ask placeholder");
assert(askHtml.includes("记一笔"), "expected quick-entry scene card");
assert(askHtml.includes('href="/quick-entry"'), "expected quick-entry path");
assert(askHtml.includes('href="/bills"'), "expected bills path");
assert(askHtml.includes('href="/reports"'), "expected reports path");
assert(askHtml.includes('href="/payroll"'), "expected payroll path");
