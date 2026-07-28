import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { Task, TaxItem, Voucher } from "@finance-taxation/domain-model";
import { DocumentRelationsPanel } from "./DocumentRelationsPanel";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const task = {
  id: "TASK-1",
  companyId: "C-1",
  businessEventId: "EVT-1",
  title: "补齐进项发票",
  assigneeDepartment: "财务部",
  status: "not_started"
} as unknown as Task & { isOverdue?: boolean };

const taxItem = {
  id: "TAX-1",
  companyId: "C-1",
  businessEventId: "EVT-1",
  taxType: "增值税",
  filingPeriod: "2026-05",
  treatment: "按 6% 计缴"
} as unknown as TaxItem;

const voucher = {
  id: "VCH-20260501-0001",
  companyId: "C-1",
  businessEventId: "EVT-1",
  summary: "采购入库",
  status: "posted"
} as unknown as Voucher;

const html = renderToStaticMarkup(
  createElement(
    MemoryRouter,
    null,
    createElement(DocumentRelationsPanel, {
      tasks: [task],
      taxItems: [taxItem],
      vouchers: [voucher],
      onViewTasks: () => undefined,
      onViewTax: () => undefined,
      onViewVouchers: () => undefined
    })
  )
);

// 关联对象列表以前只是文字罗列，现在每一条都能走过去。
assert(
  html.includes('href="/tasks"') && html.includes('aria-label="打开任务 TASK-1"'),
  `expected task link, got ${html}`
);
assert(
  html.includes('href="/tax"') && html.includes('aria-label="打开税务事项 TAX-1"'),
  `expected tax item link, got ${html}`
);
assert(
  html.includes('href="/vouchers"') && html.includes('aria-label="打开凭证 VCH-20260501-0001"'),
  `expected voucher link, got ${html}`
);

// 展示文案保持原样（标题 / 税种 / 短号），只是变成了可点的。
assert(html.includes("补齐进项发票"), "expected task title preserved");
assert(html.includes("增值税"), "expected tax type preserved");

console.log("document-relations-panel-ok");
