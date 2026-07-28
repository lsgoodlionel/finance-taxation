import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { ENTITY_KIND_LABELS, EntityLink, buildEntityTarget, type EntityKind } from "./EntityLink";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function render(node: ReactElement): string {
  return renderToStaticMarkup(createElement(MemoryRouter, null, node));
}

const ALL_KINDS: EntityKind[] = [
  "business_event",
  "voucher",
  "document",
  "task",
  "tax_item",
  "risk_finding",
  "contract"
];

// ── buildEntityTarget：每种类型的 path 与 state 字段 ────────────────────────
const expectedPaths: Record<EntityKind, string> = {
  business_event: "/events?event=EVT-1",
  voucher: "/vouchers",
  document: "/bills",
  task: "/tasks",
  tax_item: "/tax",
  risk_finding: "/risk",
  contract: "/contracts"
};

for (const kind of ALL_KINDS) {
  const target = buildEntityTarget(kind, kind === "business_event" ? "EVT-1" : "OBJ-1");
  assert(target.path === expectedPaths[kind], `unexpected path for ${kind}: ${target.path}`);
  // resourceType / resourceId 是审计与通用定位的兜底通道，每种类型都必须带上
  assert(target.state.resourceType === kind, `expected resourceType for ${kind}`);
  assert(
    target.state.resourceId === (kind === "business_event" ? "EVT-1" : "OBJ-1"),
    `expected resourceId for ${kind}`
  );
}

// 具体 stateKey 落位：目标页按这些字段选中/高亮
assert(buildEntityTarget("business_event", "EVT-1").state.businessEventId === "EVT-1", "expected businessEventId");
assert(buildEntityTarget("voucher", "V-1").state.voucherId === "V-1", "expected voucherId");
assert(buildEntityTarget("document", "DOC-1").state.documentId === "DOC-1", "expected documentId");
assert(buildEntityTarget("tax_item", "TAX-1").state.taxItemId === "TAX-1", "expected taxItemId");
assert(buildEntityTarget("risk_finding", "R-1").state.riskFindingId === "R-1", "expected riskFindingId");
assert(buildEntityTarget("contract", "C-1").state.contractId === "C-1", "expected contractId");

// task 刻意不写 stateKey：/tasks 的 businessEventId 是「按事项过滤」，
// 塞进任务 id 会得到一个空列表，比不跳还糟。
assert(
  buildEntityTarget("task", "T-1").state.businessEventId === undefined,
  "expected task not to hijack businessEventId"
);

// 查询参数需转义，否则带特殊字符的 id 会把 URL 截断
assert(
  buildEntityTarget("business_event", "EVT/1 2").path === "/events?event=EVT%2F1%202",
  `expected encoded query, got ${buildEntityTarget("business_event", "EVT/1 2").path}`
);

// ── 中文名字典：每种类型都有，且与链接的可访问名称同源 ──────────────────────
for (const kind of ALL_KINDS) {
  assert(typeof ENTITY_KIND_LABELS[kind] === "string" && ENTITY_KIND_LABELS[kind].length > 0, `missing label for ${kind}`);
}

// ── 渲染：href 指向目标路由，aria-label 说明「打开什么」 ────────────────────
const voucherHtml = render(createElement(EntityLink, { kind: "voucher", id: "V-2026-001" }));
assert(voucherHtml.includes('href="/vouchers"'), `expected href, got ${voucherHtml}`);
assert(voucherHtml.includes("V-2026-001"), "expected id as default link text");
assert(
  voucherHtml.includes(`aria-label="打开${ENTITY_KIND_LABELS.voucher} V-2026-001"`),
  `expected aria-label, got ${voucherHtml}`
);

// children 覆盖默认文案，但可访问名称仍带 id（读屏用户要能区分同名的两条）
const labelledHtml = render(createElement(EntityLink, { kind: "document", id: "DOC-9" }, "这张回单"));
assert(labelledHtml.includes("这张回单"), "expected custom label rendered");
assert(labelledHtml.includes("DOC-9"), "expected id retained in aria-label");

// business_event 的 href 带查询参数（EventsPage 只认查询参数）
const eventHtml = render(createElement(EntityLink, { kind: "business_event", id: "EVT-7" }));
assert(eventHtml.includes('href="/events?event=EVT-7"'), `expected query href, got ${eventHtml}`);

// ── id 缺失：降级为纯文本占位，不渲染成死链 ────────────────────────────────
const emptyHtml = render(createElement(EntityLink, { kind: "voucher", id: null }));
assert(!emptyHtml.includes("<a"), `expected no anchor for empty id, got ${emptyHtml}`);
assert(emptyHtml.includes("—"), "expected default fallback dash");

const customFallbackHtml = render(
  createElement(EntityLink, { kind: "voucher", id: undefined, fallback: "尚未生成" })
);
assert(!customFallbackHtml.includes("<a"), "expected no anchor for undefined id");
assert(customFallbackHtml.includes("尚未生成"), "expected custom fallback text");

const blankIdHtml = render(createElement(EntityLink, { kind: "voucher", id: "" }));
assert(!blankIdHtml.includes("<a"), "expected no anchor for blank id");

console.log("entity-link-ok");
