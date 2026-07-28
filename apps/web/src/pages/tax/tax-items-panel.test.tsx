import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { TaxItem } from "@finance-taxation/domain-model";
import { TaxItemsPanel } from "./TaxItemsPanel";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const item = {
  id: "TAX-1",
  companyId: "C-1",
  businessEventId: "EVT-1",
  mappingId: "MAP-1",
  taxType: "增值税",
  treatment: "按 6% 计缴",
  basis: "含税收入",
  filingPeriod: "2026-05",
  status: "pending",
  source: "analysis",
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z"
} as unknown as TaxItem;

function render(props: { navEventId: string | null; navTaxItemId: string | null }): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(TaxItemsPanel, { items: [item], ...props })
    )
  );
}

const html = render({ navEventId: null, navTaxItemId: null });

// 编号列不再是死文本：它是回到本页并高亮该税务事项的稳定锚点。
assert(
  html.includes('aria-label="打开税务事项 TAX-1"') && html.includes('href="/tax"'),
  `expected tax item link, got ${html}`
);

// 新增「关联事项」列：税务事项的 businessEventId 现在能直接走过去。
assert(
  html.includes('href="/events?event=EVT-1"') && html.includes('aria-label="打开经营事项 EVT-1"'),
  `expected business event link column, got ${html}`
);
assert(html.includes("关联事项"), `expected 关联事项 column header, got ${html}`);

// 提示条里的事项编号同样可点，用户能一键回到那条事项本身。
const scopedHtml = render({ navEventId: "EVT-1", navTaxItemId: null });
assert(
  scopedHtml.includes('aria-label="打开经营事项 EVT-1"'),
  `expected linkable event id in the scope banner, got ${scopedHtml}`
);

console.log("tax-items-panel-ok");
