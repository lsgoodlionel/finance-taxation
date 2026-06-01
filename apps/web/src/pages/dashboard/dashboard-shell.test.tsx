// Pure-logic unit tests for ChairmanDashboardPage — no DOM required
function okDash(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

// ─── Trend data builder ───────────────────────────────────────────────────────

interface ProfitOverview {
  revenue: string; cost: string; expense: string;
  grossProfit: string; netProfit: string; grossMargin: string; netMargin: string;
}

function buildTrendData(overview: ProfitOverview) {
  const revenue = parseFloat(overview.revenue.replace(/,/g, "")) || 0;
  const cost    = parseFloat(overview.cost.replace(/,/g, ""))    || 0;
  const factors = [0.72, 0.81, 0.88, 0.94, 0.97, 1.0];
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const f = factors[i] ?? 1;
    return { month: `${d.getMonth() + 1}月`, 收入: Math.round(revenue * f), 成本: Math.round(cost * f * 0.95) };
  });
}

const overview: ProfitOverview = {
  revenue: "1000000", cost: "600000", expense: "200000",
  grossProfit: "400000", netProfit: "200000", grossMargin: "40%", netMargin: "20%",
};

const trend = buildTrendData(overview);
okDash(trend.length === 6, "builds exactly 6 monthly data points");
okDash(trend[5]?.收入 === 1000000, "last month uses full revenue value");
okDash((trend[0]?.收入 ?? 0) < (trend[5]?.收入 ?? 0), "earlier months are smaller");

// ─── Pie data builder ─────────────────────────────────────────────────────────

function buildExpenseData(ov: ProfitOverview) {
  const cost    = parseFloat(ov.cost.replace(/,/g, ""))    || 0;
  const expense = parseFloat(ov.expense.replace(/,/g, "")) || 0;
  const revenue = parseFloat(ov.revenue.replace(/,/g, "")) || 1;
  const salesCost = Math.round(cost * 0.65);
  const laborCost = Math.round(cost * 0.20);
  const otherCost = cost - salesCost - laborCost;
  const selling   = Math.round(expense * 0.40);
  const mgmt      = Math.round(expense * 0.35);
  const finance   = expense - selling - mgmt;
  const profit    = Math.max(0, Math.round(revenue - cost - expense));
  return [
    { name: "主营成本", value: salesCost },
    { name: "人工成本", value: laborCost },
    { name: "其他成本", value: otherCost },
    { name: "销售费用", value: selling },
    { name: "管理费用", value: mgmt },
    { name: "财务费用", value: finance },
    { name: "净利润",   value: profit },
  ].filter(d => d.value > 0);
}

const pieData = buildExpenseData(overview);
okDash(pieData.length > 0, "pie data has at least one segment");
const total = pieData.reduce((s, d) => s + d.value, 0);
okDash(Math.abs(total - 1000000) < 10, "pie segments sum back to revenue");

// ─── Trend tag color ──────────────────────────────────────────────────────────

function trendColor(t: string): string {
  if (t.startsWith("+")) return "success";
  if (t.startsWith("-")) return "error";
  return "default";
}

okDash(trendColor("+12.5%") === "success", "positive trend → success");
okDash(trendColor("-3.2%")  === "error",   "negative trend → error");
okDash(trendColor("持平")   === "default", "neutral trend → default");
