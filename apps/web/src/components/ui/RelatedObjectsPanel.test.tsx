import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { RelatedObjectsPanel, groupObjectsByKind } from "./RelatedObjectsPanel";
import { ENTITY_KIND_LABELS } from "./EntityLink";
import type { FlowRelatedObject } from "../../lib/object-flow";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function render(node: ReactElement): string {
  return renderToStaticMarkup(createElement(MemoryRouter, null, node));
}

const objects: FlowRelatedObject[] = [
  { kind: "document", id: "DOC-1", label: "银行回单" },
  { kind: "voucher", id: "V-1" },
  { kind: "document", id: "DOC-2" },
  { kind: "task", id: "T-1", label: "补齐资料" }
];

// ── groupObjectsByKind：按类型归拢，组序与组内序都沿用入参顺序 ──────────────
const groups = groupObjectsByKind(objects);
assert(groups.map((group) => group.kind).join(",") === "document,voucher,task", "expected first-seen kind order");
assert(groups[0]?.objects.map((object) => object.id).join(",") === "DOC-1,DOC-2", "expected in-group order preserved");
assert(groups[1]?.objects.length === 1, "expected single-object group");
assert(objects.length === 4, "expected grouping not to mutate input");
assert(groupObjectsByKind([]).length === 0, "expected no groups for empty input");

// ── 默认收起：这是「需要时再看」的内容，不该开屏就占地方 ────────────────────
const html = render(createElement(RelatedObjectsPanel, { objects }));
assert(html.includes("<details"), "expected native disclosure element");
assert(!html.includes(' open=""'), `expected collapsed by default, got ${html.slice(0, 160)}`);
assert(html.includes("<summary"), "expected summary as the toggle");
assert(html.includes("相关的单子与记录"), "expected default title");
assert(html.includes(">4<"), "expected total count badge on the summary");

// ── 展开后按类型分组，每条都是可跳转链接 ───────────────────────────────────
assert(html.includes(ENTITY_KIND_LABELS.document), "expected document group title");
assert(html.includes(ENTITY_KIND_LABELS.voucher), "expected voucher group title");
assert(html.includes(ENTITY_KIND_LABELS.task), "expected task group title");
assert(html.includes('href="/bills"'), "expected document link");
assert(html.includes('href="/vouchers"'), "expected voucher link");
assert(html.includes('href="/tasks"'), "expected task link");
assert((html.match(/<a /g) ?? []).length === 4, "expected one link per object");

// label 优先于 id，缺 label 时退回 id
assert(html.includes("银行回单"), "expected label used as link text");
assert(html.includes("补齐资料"), "expected task label used as link text");
assert(html.includes("DOC-2"), "expected id fallback when label missing");
// 可访问名称始终带 id，读屏用户才能区分同名的两条
assert(html.includes(`aria-label="打开${ENTITY_KIND_LABELS.document} DOC-1"`), "expected id in accessible name");

// ── collapsedByDefault=false：需要常驻时可以直接展开 ───────────────────────
const openHtml = render(createElement(RelatedObjectsPanel, { objects, collapsedByDefault: false }));
assert(openHtml.includes(' open=""'), "expected expanded when collapsedByDefault is false");

// ── 自定义标题 ─────────────────────────────────────────────────────────────
const titledHtml = render(createElement(RelatedObjectsPanel, { objects, title: "这件事牵扯到的东西" }));
assert(titledHtml.includes("这件事牵扯到的东西"), "expected custom title");
assert(!titledHtml.includes("相关的单子与记录"), "expected default title replaced");

// ── 没有关联对象时不渲染空壳 ───────────────────────────────────────────────
const emptyHtml = render(createElement(RelatedObjectsPanel, { objects: [] }));
assert(emptyHtml === "", `expected nothing rendered when there is nothing related, got ${emptyHtml}`);

// ── 单一类型也照常分组（组标题告诉用户这堆是什么） ─────────────────────────
const singleKindHtml = render(
  createElement(RelatedObjectsPanel, { objects: [{ kind: "risk_finding", id: "R-1" }] })
);
assert(singleKindHtml.includes(ENTITY_KIND_LABELS.risk_finding), "expected group title for a single kind");
assert(singleKindHtml.includes('href="/risk"'), "expected risk link");
assert(singleKindHtml.includes(">1<"), "expected count of one");

console.log("related-objects-panel-ok");
