import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { BalanceSheetReport } from "@finance-taxation/domain-model";
import { BalanceSheetPanel } from "./BalanceSheetPanel";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function render(report: BalanceSheetReport | null): string {
  return renderToStaticMarkup(createElement(BalanceSheetPanel, { report }));
}

const cleanReport: BalanceSheetReport = {
  periodLabel: "2026-04",
  asOfDate: "2026-04-30",
  assets: [{ code: "1002", label: "银行存款", amount: "1000" }],
  liabilities: [],
  equity: [{ code: "3001", label: "3001", amount: "1000" }],
  unclassified: [],
  warnings: [],
  totals: { assets: "1000", liabilities: "0", equity: "1000", liabilitiesAndEquity: "1000" }
};

// ── V12-A5：未分类科目必须在界面上可见 ───────────────────────────────────────
// 后端把归类不到的科目显式列出来了，但如果界面不呈现，用户看到的仍然只是一张
// 不平的表、无从查起——等于没修。

const cleanHtml = render(cleanReport);
assert(cleanHtml.includes("银行存款"), "正常报表应渲染资产行");
assert(
  !cleanHtml.includes("有科目未纳入资产负债表口径"),
  "没有未分类科目时不得出现告警横幅，否则告警会变成噪音被忽略"
);

const warnedHtml = render({
  ...cleanReport,
  unclassified: [{ code: "9999", label: "9999", amount: "250" }],
  warnings: ["有 1 个科目未纳入资产负债表口径（9999），其余额未计入任何合计。"]
});
assert(warnedHtml.includes("有科目未纳入资产负债表口径"), "有未分类科目时必须渲染告警横幅");
assert(warnedHtml.includes("9999"), "告警必须点名具体科目代码，用户才能定位");
assert(warnedHtml.includes("250"), "告警应给出未计入合计的金额");

// 后端字段缺失（老版本 API / 缓存响应）时不得白屏。
const legacyHtml = renderToStaticMarkup(
  createElement(BalanceSheetPanel, {
    report: {
      ...cleanReport,
      unclassified: undefined,
      warnings: undefined
    } as unknown as BalanceSheetReport
  })
);
assert(legacyHtml.includes("银行存款"), "缺少 unclassified/warnings 字段时仍应正常渲染");
assert(
  !legacyHtml.includes("有科目未纳入资产负债表口径"),
  "字段缺失不应被当成有未分类科目"
);

const emptyHtml = render(null);
assert(emptyHtml.includes("暂无资产负债表"), "无报表时应渲染空状态");
