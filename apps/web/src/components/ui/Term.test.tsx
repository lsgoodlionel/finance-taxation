import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Term } from "./Term";
import { WorkspaceModeProvider } from "../../lib/workspace-mode";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

// ── pro 模式（Provider 外安全回退 pro）：渲染原词 + 虚线下划线 ────────────────
const proHtml = renderToStaticMarkup(createElement(Term, { k: "posting" }, "过账"));
assert(proHtml.includes("过账"), "expected pro mode to render the original term");
assert(proHtml.includes("dashed"), "expected dashed underline hint in pro mode");
assert(proHtml.includes("cursor:help"), "expected cursor:help affordance in pro mode");
assert(!proHtml.includes("记入正式账本"), "expected pro mode to hide plain wording");

// ── 自闭合用法 <Term k="..." />：回退渲染词条原词 ────────────────────────────
const selfClosingHtml = renderToStaticMarkup(createElement(Term, { k: "journal-entry" }));
assert(selfClosingHtml.includes("分录"), "expected self-closing usage to render entry term");

// ── 未命中词条：原样渲染子内容，不报错 ───────────────────────────────────────
const missHtml = renderToStaticMarkup(createElement(Term, { k: "no-such-term" }, "原文照旧"));
assert(missHtml.includes("原文照旧"), "expected unknown key to render children as-is");
assert(!missHtml.includes("dashed"), "expected unknown key to skip term styling");

// ── guided 模式：白话短语 +（原词）括注 ─────────────────────────────────────
// Provider 初始化读取 window.localStorage：在 node 环境注入最小 stub 模拟 guided。
(globalThis as Record<string, unknown>).window = {
  localStorage: {
    getItem: () => "guided",
    setItem: () => undefined
  }
};
const guidedHtml = renderToStaticMarkup(
  createElement(WorkspaceModeProvider, null, createElement(Term, { k: "posting" }, "过账"))
);
delete (globalThis as Record<string, unknown>).window;
assert(guidedHtml.includes("记入正式账本"), "expected guided mode to render plain wording");
assert(guidedHtml.includes("（过账）"), "expected guided mode to annotate original term");
assert(guidedHtml.includes("dashed"), "expected dashed underline hint in guided mode");
