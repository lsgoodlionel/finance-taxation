import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProfitStatementReport } from "@finance-taxation/domain-model";
import { ProfitStatementPanel } from "./ProfitStatementPanel";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function render(report: ProfitStatementReport | null): string {
  return renderToStaticMarkup(createElement(ProfitStatementPanel, { report }));
}

// 利润总额 700，所得税 175，净利润 525：期间费用不含税额，税额只在净利处扣一次。
const taxedReport: ProfitStatementReport = {
  periodLabel: "2026-05",
  revenues: [{ code: "6001", label: "主营业务收入", amount: "1000.00" }],
  costsAndExpenses: [{ code: "6001c", label: "主营业务成本", amount: "200.00" }],
  totals: {
    revenue: "1000.00",
    cost: "200.00",
    grossProfit: "800.00",
    expenses: "100.00",
    totalProfit: "700.00",
    incomeTax: "175.00",
    netProfit: "525.00"
  }
};

const taxedHtml = render(taxedReport);
assert(taxedHtml.includes("所得税费用"), "汇总块应渲染所得税费用行");
assert(taxedHtml.includes("175.00"), "所得税费用行应显示 totals.incomeTax 的金额");

// 所得税行必须落在「利润总额」与「净利润」之间，用户才能看懂两者的落差。
const totalProfitIndex = taxedHtml.indexOf("利润总额");
const incomeTaxIndex = taxedHtml.indexOf("所得税费用");
const netProfitIndex = taxedHtml.indexOf("净利润");
assert(totalProfitIndex >= 0, "汇总块应渲染利润总额行");
assert(netProfitIndex >= 0, "汇总块应渲染净利润行");
assert(
  totalProfitIndex < incomeTaxIndex && incomeTaxIndex < netProfitIndex,
  "所得税费用行应位于利润总额与净利润之间"
);

// 无所得税时仍渲染该行（金额为 0），口径保持稳定、不出现忽隐忽现的行。
const taxFreeHtml = render({
  ...taxedReport,
  totals: { ...taxedReport.totals, incomeTax: "0.00", netProfit: "700.00" }
});
assert(taxFreeHtml.includes("所得税费用"), "无所得税时仍应保留所得税费用行");
assert(taxFreeHtml.includes("0.00"), "无所得税时所得税费用行应显示 0");

const emptyHtml = render(null);
assert(emptyHtml.includes("暂无利润表"), "无报表时应渲染空状态");
