import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { EventDetail } from "../../lib/api";
import { EventReferenceDetails } from "./EventReferenceDetails";
import { EventSummaryCard } from "./EventSummaryCard";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * EventDetailBody 不能在 node 里整体渲染：它挂着 AiEventInsights，
 * 而后者运行时 import lib/api（读 import.meta.env）。组合结构的断言放在
 * event-detail-blocks.test.mjs，这里只验证详情体自有的两块。
 */
function render(node: React.ReactElement): string {
  return renderToStaticMarkup(createElement(MemoryRouter, null, node));
}

function makeDetail(): EventDetail {
  return {
    id: "EVT-1",
    documentMappings: [
      { id: "DM-1", documentType: "invoice", title: "销售发票", status: "required", ownerDepartment: "财务部", notes: "" }
    ],
    taxMappings: [
      { id: "TM-1", taxType: "增值税", treatment: "按 6% 计税", status: "pending", basis: "", filingPeriod: "2026-07" }
    ],
    voucherDrafts: [],
    taskTree: [],
    activities: [{ id: "ACT-1", actorName: "张三", summary: "创建了事项", createdAt: "2026-07-01T09:00:00.000Z" }]
  } as unknown as EventDetail;
}

// 「这一笔是什么」把描述、下游计数与异常摘要并成一块
{
  const html = render(
    createElement(EventSummaryCard, {
      description: "客户结算尾款",
      counts: { tasks: 2, documents: 1, vouchers: 3, taxItems: 0 },
      exception: { tone: "warning", title: "采购资料不齐", summary: "缺验收单", bullets: ["补验收单"] }
    })
  );

  assert(html.includes("客户结算尾款"), "expected the event description");
  assert(html.includes("已拆出任务 2 项"), "expected downstream counts");
  assert(html.includes("采购资料不齐"), "expected the exception summary title");
  assert(html.includes("补验收单"), "expected the exception summary bullets");
}

// 事项本地明细默认收起，但内容一条不少
{
  const html = render(createElement(EventReferenceDetails, { detail: makeDetail() }));

  assert(html.startsWith("<details"), "expected a native details disclosure");
  assert(!html.startsWith("<details open"), "expected the reference block to stay collapsed");
  assert(html.includes("销售发票"), "expected document mappings to remain reachable");
  assert(html.includes("按 6% 计税"), "expected tax mappings to remain reachable");
  assert(html.includes("创建了事项"), "expected the activity timeline to remain reachable");
}
