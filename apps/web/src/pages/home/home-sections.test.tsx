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

// 待办来源接口失败且无卡片：禁止「都安排好了」，必须说读不到 + 给重试
const failedEmptyHtml = render(
  createElement(HomePendingSection, {
    loading: false,
    cards: [],
    remaining: 0,
    acting: null,
    sourcesFailed: true,
    onApprove: () => undefined,
    onReject: () => undefined,
    onRetry: () => undefined
  })
);
assert(failedEmptyHtml.includes("暂时读取不到待办"), "expected honest failure copy instead of empty state");
assert(!failedEmptyHtml.includes("都安排好了"), "must not claim everything is handled when a source failed");
assert(!failedEmptyHtml.includes("今天没有需要您处理的事"), "must not claim there is nothing to do on failure");
assert(failedEmptyHtml.includes("重新读取"), "expected retry action on failure");

// 部分来源失败但仍有卡片：顶部给出「可能不完整」提醒
const partialFailedHtml = render(
  createElement(HomePendingSection, {
    loading: false,
    cards,
    remaining: 0,
    acting: null,
    sourcesFailed: true,
    onApprove: () => undefined,
    onReject: () => undefined,
    onRetry: () => undefined
  })
);
assert(partialFailedHtml.includes("下面显示的可能不完整"), "expected partial-failure warning above cards");

// AI 草稿卡的可见风险标记：借贷不平 / AI 低置信
const riskyCardHtml = render(
  createElement(HomePendingSection, {
    loading: false,
    cards: [{ ...(cards[0] as PendingCardModel), balanced: false, proposalLevel: "manual" }],
    remaining: 0,
    acting: null,
    onApprove: () => undefined,
    onReject: () => undefined
  })
);
assert(riskyCardHtml.includes("借贷不平"), "expected unbalanced marker on draft card");
assert(riskyCardHtml.includes("AI 没把握，请人工核对"), "expected low-confidence marker on draft card");

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
    revenue: "300,000.00", cost: "150,000.00", expense: "30,000.00", incomeTax: "0.00",
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
assert(kpiHtml.includes("¥12 万"), "expected profit value in 万 with plain formatting");
assert(kpiHtml.includes("本月要交多少税"), "expected tax card");
assert(kpiHtml.includes("¥8,600.00"), "expected tax value with thousands separator");
assert(kpiHtml.includes("1 个风险"), "expected risk count wording");
assert(kpiHtml.includes('href="/risk"'), "expected risk drill-down link");
assert(kpiHtml.includes('href="/tax"'), "expected tax drill-down link");

// 数据缺失（非失败）→ 白话降级文案
const kpiEmptyHtml = render(createElement(HomeKpiSection, { loading: false, dashboard: null, forecast: null }));
assert(kpiEmptyHtml.includes("经营数据暂时取不到"), "expected kpi fallback copy");

// 单路数据源失败 → 该卡显示「读取失败」，不得把故障说成「等财务录入本月账目」
const kpiDashboardFailedHtml = render(
  createElement(HomeKpiSection, { loading: false, dashboard: null, forecast, dashboardFailed: true })
);
assert(kpiDashboardFailedHtml.includes("读取失败"), "expected failure value on dashboard-backed cards");
assert(
  !kpiDashboardFailedHtml.includes("等财务录入本月账目后就能看到"),
  "must not blame the user for an API failure"
);
assert(kpiDashboardFailedHtml.includes("约 5 个月"), "expected the healthy forecast card to still render");

// 现金流预测失败 → 现金卡读取失败，不得出现「还没有足够的现金流数据，先让财务录几笔账」
const kpiForecastFailedHtml = render(
  createElement(HomeKpiSection, { loading: false, dashboard, forecast: null, forecastFailed: true })
);
assert(kpiForecastFailedHtml.includes("读取失败"), "expected failure value on the runway card");
assert(!kpiForecastFailedHtml.includes("现金充足"), "must not claim ample cash when the forecast failed");

// 两路都失败 → 整段说明读不到 + 重试
const kpiAllFailedHtml = render(
  createElement(HomeKpiSection, {
    loading: false,
    dashboard: null,
    forecast: null,
    dashboardFailed: true,
    forecastFailed: true,
    onRetry: () => undefined
  })
);
assert(kpiAllFailedHtml.includes("经营数据暂时读取不到"), "expected honest all-failed copy");
assert(kpiAllFailedHtml.includes("重新读取"), "expected retry action when everything failed");

// 零数据现金流（新公司三项全 0）→ 绝不给绿灯「现金充足」
const zeroForecast: CashForecast = {
  cashBalance: 0, expectedInflow: 0, expectedOutflow: 0,
  projectedBalance: 0, salaryNeed: 0, canPaySalary: true, gap: 0, verdict: "ok"
};
const kpiZeroHtml = render(createElement(HomeKpiSection, { loading: false, dashboard, forecast: zeroForecast }));
assert(!kpiZeroHtml.includes("现金充足"), "must not show green ample light on all-zero cash-flow data");
assert(kpiZeroHtml.includes("还看不出来"), "expected honest unknown runway copy on zero data");

// ── 第三段：问 AI 输入框 + 4 张场景卡 ────────────────────────────────────────
const askHtml = render(createElement(HomeAskSection));
assert(askHtml.includes("这个月钱花哪了"), "expected ask placeholder");
assert(askHtml.includes("记一笔"), "expected quick-entry scene card");
assert(askHtml.includes('href="/quick-entry"'), "expected quick-entry path");
assert(askHtml.includes('href="/bills"'), "expected bills path");
assert(askHtml.includes('href="/reports"'), "expected reports path");
assert(askHtml.includes('href="/payroll"'), "expected payroll path");
