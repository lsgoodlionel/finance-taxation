import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { ObjectFlowBar } from "./ObjectFlowBar";
import { buildObjectFlow } from "../../lib/object-flow";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function render(node: ReactElement): string {
  return renderToStaticMarkup(createElement(MemoryRouter, null, node));
}

const inProgress = buildObjectFlow([
  {
    key: "collect",
    label: "收齐材料",
    done: true,
    owner: "出纳",
    related: [{ kind: "document", id: "DOC-1", label: "银行回单" }]
  },
  {
    key: "review",
    label: "复核金额",
    done: false,
    owner: "会计小李",
    related: [{ kind: "voucher", id: "V-2026-001" }]
  },
  { key: "submit", label: "提交办理", done: false }
]);

const html = render(createElement(ObjectFlowBar, { flow: inProgress }));

// ── 步骤序列：每一步都在，且用有序列表表达先后关系 ──────────────────────────
assert(html.includes("<ol"), "expected ordered list for sequential steps");
assert(html.includes('aria-label="办理步骤"'), "expected accessible name on the step rail");
assert(html.includes("收齐材料"), "expected done step label");
assert(html.includes("复核金额"), "expected current step label");
assert(html.includes("提交办理"), "expected pending step label");

// ── 状态不能只靠颜色：每个标记都带文字状态，当前步另有 aria-current ─────────
assert(html.includes('aria-label="已办完"'), "expected done status text for screen readers");
assert(html.includes('aria-label="正在办"'), "expected current status text");
assert(html.includes('aria-label="还没轮到"'), "expected pending status text");
assert((html.match(/aria-current="step"/g) ?? []).length === 1, "expected exactly one current step");

// ── 当前步显式给出「在等什么、谁来做」──────────────────────────────────────
assert(html.includes("现在这步："), "expected current-step callout");
assert(html.includes("由谁办："), "expected owner label");
assert(html.includes("会计小李"), "expected current step owner");
// 未卡住时没有「在等」这一项
assert(!html.includes("在等："), "expected no waiting hint when not blocked");

// ── 每步的关联对象是可跳转链接，不是裸 id ──────────────────────────────────
assert(html.includes('href="/bills"'), `expected document link, got ${html}`);
assert(html.includes("银行回单"), "expected related object label");
assert(html.includes('href="/vouchers"'), "expected voucher link on the current step");
assert(html.includes("V-2026-001"), "expected voucher id as fallback link text");

// 整体状态词
assert(html.includes("办理中"), "expected in-progress overall text");

// ── blocked：卡住的原因浮到当前步说明里 ────────────────────────────────────
const blocked = buildObjectFlow([
  { key: "collect", label: "收齐材料", done: true },
  { key: "review", label: "复核金额", done: false, blockedReason: "缺一张银行回单", owner: "出纳" }
]);
const blockedHtml = render(createElement(ObjectFlowBar, { flow: blocked }));
assert(blockedHtml.includes('aria-label="卡住了"'), "expected blocked status text on the marker");
assert(blockedHtml.includes("在等："), "expected waiting label when blocked");
assert(blockedHtml.includes("缺一张银行回单"), "expected blocking reason surfaced");
assert(blockedHtml.includes("现在这步："), "expected blocked step to still be the current one");
assert((blockedHtml.match(/aria-current="step"/g) ?? []).length === 1, "expected blocked step marked current");

// ── 全部完成：给明确的完成态，不再留「现在这步」的悬念 ─────────────────────
const finished = buildObjectFlow([
  { key: "collect", label: "收齐材料", done: true },
  { key: "review", label: "复核金额", done: true }
]);
const doneHtml = render(createElement(ObjectFlowBar, { flow: finished }));
assert(doneHtml.includes("全部办完"), "expected done overall text");
assert(doneHtml.includes("这一笔的每一步都办完了"), "expected explicit completion message");
assert(!doneHtml.includes("现在这步："), "expected no current-step callout when finished");
assert(!doneHtml.includes("aria-current"), "expected no current step when finished");

// ── 标题：默认可用，也可以带上对象本身 ─────────────────────────────────────
assert(html.includes("这一笔办到哪了"), "expected default title");
const titledHtml = render(createElement(ObjectFlowBar, { flow: inProgress, title: "这张单子办到哪了" }));
assert(titledHtml.includes("这张单子办到哪了"), "expected custom title");
assert(titledHtml.includes("<h3"), "expected title rendered as a heading");

// ── 空流程不占位 ───────────────────────────────────────────────────────────
const emptyHtml = render(createElement(ObjectFlowBar, { flow: buildObjectFlow([]) }));
assert(emptyHtml === "", `expected nothing rendered for an empty flow, got ${emptyHtml}`);

// ── 与 FinanceFlowBar 划清界限：本组件不是全局导航，不渲染那 10 个固定环节 ──
for (const globalStage of ["经营事项", "任务分派", "单据补齐", "凭证记账", "账簿过账", "风险勾稽"]) {
  assert(!html.includes(globalStage), `expected no global nav stage "${globalStage}" in an object flow`);
}
assert(!html.includes("btn"), "expected no navigation buttons in the object flow strip");

console.log("object-flow-bar-ok");
