// Pure-logic unit tests for ChairmanDashboardPage — no DOM required
import type { DashboardData } from "../../lib/api";
import { buildExpenseData, type ExpenseSlice } from "./expense-slices";

function okDash(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type ProfitOverview = DashboardData["profitOverview"];

// 「近 6 月收支趋势」图曾连同它的 buildTrendData 一起被删：6 个点里 5 个是把本月收入
// 乘一组写死系数 [0.72, 0.81, 0.88, 0.94, 0.97, 1.0] 编出来的，必然画成单调上升，
// 与公司实际是增长还是下滑无关。这里原本还照抄了一份该实现并断言「越早的月份数越小」——
// 断言的其实是那组写死的系数，等于用测试把编造的口径锁死。
//
// 现在 /api/dashboard/chairman/trend 按会计期间聚合真实总账，图已恢复。它的数据映射
// 另有 trend-series.test.ts 逐点钉住「每个点都来自接口返回」，本文件不再涉及趋势。

// 期间费用 200000 已不含所得税；所得税 50000 单列，净利 = 100 万 - 60 万 - 20 万 - 5 万。
const overview: ProfitOverview = {
  revenue: "1000000", cost: "600000", expense: "200000", incomeTax: "50000",
  grossProfit: "400000", netProfit: "150000", grossMargin: "40%", netMargin: "15%",
};

// ─── Pie data builder ─────────────────────────────────────────────────────────
// 直接引用组件用的那一份实现，避免测试里再复制一版口径（复制版正是漏掉所得税的地方）。

function sliceSum(slices: ExpenseSlice[]): number {
  return slices.reduce((sum, slice) => sum + slice.value, 0);
}

function sliceValue(slices: ExpenseSlice[], name: string): number | undefined {
  return slices.find((slice) => slice.name === name)?.value;
}

const pieData = buildExpenseData(overview);
okDash(pieData.length > 0, "pie data has at least one segment");
okDash(sliceSum(pieData) === 1000000, "有所得税时各分块之和等于营业收入");
okDash(sliceValue(pieData, "所得税费用") === 50000, "所得税单列成一块，金额取自后端");
okDash(sliceValue(pieData, "净利润") === 150000, "净利润已扣除所得税，不再虚高一个税额");

// 无所得税（小微免税 / 亏损期无税额）：不画空分块，其余口径不变。
const taxFreeOverview: ProfitOverview = { ...overview, incomeTax: "0", netProfit: "200000" };
const taxFreePie = buildExpenseData(taxFreeOverview);
okDash(sliceSum(taxFreePie) === 1000000, "无所得税时各分块之和仍等于营业收入");
okDash(sliceValue(taxFreePie, "所得税费用") === undefined, "所得税为 0 时不产生空分块");
okDash(sliceValue(taxFreePie, "净利润") === 200000, "无所得税时净利润等于利润总额");

// 千分位与小数金额同样要能解析出正确分块。
const formattedPie = buildExpenseData({
  ...overview,
  revenue: "1,000,000.00", cost: "600,000.00", expense: "200,000.00", incomeTax: "50,000.00",
});
okDash(sliceSum(formattedPie) === 1000000, "带千分位的金额解析后分块之和仍等于营业收入");

// ─── Trend tag color ──────────────────────────────────────────────────────────

function trendColor(t: string): string {
  if (t.startsWith("+")) return "success";
  if (t.startsWith("-")) return "error";
  return "default";
}

okDash(trendColor("+12.5%") === "success", "positive trend → success");
okDash(trendColor("-3.2%")  === "error",   "negative trend → error");
okDash(trendColor("持平")   === "default", "neutral trend → default");

// ─── 环比文案是否可标注（后端给不出环比时不得挂「环比上月」）────────────────────

import { hasTrendComparison } from "./kpi-trend";

okDash(hasTrendComparison("+1,300") === true, "有环比差额 → 可标注环比上月");
okDash(hasTrendComparison("-500") === true, "负向环比 → 可标注环比上月");
okDash(hasTrendComparison("持平") === true, "持平是真实环比结论 → 可标注");
okDash(hasTrendComparison("—") === false, "风险卡无历史快照 → 不得标注环比上月");
okDash(hasTrendComparison("无上期数据") === false, "首期无上期 → 不得标注环比上月");
okDash(hasTrendComparison("暂无数据") === false, "无账目数据 → 不得标注环比上月");
okDash(hasTrendComparison("  ") === false, "空白值 → 不得标注环比上月");

// ─── 段落呈现：问句在前、结论在后，且结论不能只靠颜色说话 ─────────────────────

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardQuestionSection } from "./DashboardQuestionSection";

{
  const html = renderToStaticMarkup(
    createElement(
      DashboardQuestionSection,
      {
        question: { key: "decisions", heading: "有没有事要我拍板？", answer: "3 张凭证等您审批。", tone: "warn" },
        children: createElement("div", null, "alert-cards")
      }
    )
  );

  okDash(html.includes("有没有事要我拍板？"), "段标题是问句");
  okDash(html.includes("3 张凭证等您审批。"), "结论在图表之前先说出来");
  okDash(html.indexOf("有没有事要我拍板？") < html.indexOf("alert-cards"), "结论必须排在图表之前");
  okDash(html.includes('aria-labelledby="chairman-q-decisions"'), "每段要有可被读屏定位的名称");
  okDash(html.includes("<h2"), "段标题用 h2，页面才有可跳转的结构");
}

{
  // 「算不出」用中性色，绝不能落到表示「没问题」的绿色上。
  const html = renderToStaticMarkup(
    createElement(
      DashboardQuestionSection,
      {
        question: { key: "cash", heading: "钱够不够用？", answer: "本期还没有账务数据，算不出可动用资金。", tone: "unknown" },
        children: createElement("div", null, "forecast")
      }
    )
  );
  okDash(!html.includes("#15803d"), "unknown 不得渲染成表示「良好」的绿色");
}
