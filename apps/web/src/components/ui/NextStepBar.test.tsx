import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { NextStepBar, NextStepBarContent } from "./NextStepBar";
import { WorkspaceModeProvider } from "../../lib/workspace-mode";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function stubStoredMode(mode: string): void {
  (globalThis as { window?: unknown }).window = {
    localStorage: { getItem: () => mode, setItem: () => undefined },
  };
}

const sampleProps = {
  current: "票已上传",
  next: [
    { label: "等财务入账", path: "/tasks", hint: "无需您操作，财务会跟进" },
    { label: "问 AI", path: "/assistant" },
  ],
};

function renderBar(node: ReactElement): string {
  return renderToStaticMarkup(createElement(MemoryRouter, null, node));
}

// ── 内容渲染：当前状态 + 下一步动作按钮 ──────────────────────────────────────
const contentHtml = renderBar(createElement(NextStepBarContent, sampleProps));
assert(contentHtml.includes("票已上传"), "expected current status text");
assert(contentHtml.includes("下一步"), "expected next-step label");
assert(contentHtml.includes("等财务入账"), "expected first action label");
assert(contentHtml.includes("问 AI"), "expected second action label");
assert(contentHtml.includes("无需您操作，财务会跟进"), "expected action hint as title attribute");
assert(contentHtml.includes("下一步建议"), "expected accessible aria label");

// 无下一步动作时只展示当前状态，不渲染「下一步：」
const noNextHtml = renderBar(createElement(NextStepBarContent, { current: "已全部办完", next: [] }));
assert(noNextHtml.includes("已全部办完"), "expected current status without actions");
assert(!noNextHtml.includes("下一步："), "expected next-step label hidden when no actions");

// ── guided 模式：渲染引导条 ──────────────────────────────────────────────────
stubStoredMode("guided");
const guidedHtml = renderBar(
  createElement(WorkspaceModeProvider, null, createElement(NextStepBar, sampleProps))
);
assert(guidedHtml.includes("票已上传"), "expected bar to render in guided mode");
assert(guidedHtml.includes("等财务入账"), "expected actions to render in guided mode");

// ── pro 模式：返回 null ──────────────────────────────────────────────────────
stubStoredMode("pro");
const proHtml = renderBar(
  createElement(WorkspaceModeProvider, null, createElement(NextStepBar, sampleProps))
);
assert(proHtml === "", "expected bar to render nothing in pro mode");

// Provider 外（安全回退 pro）同样不渲染
delete (globalThis as { window?: unknown }).window;
const fallbackHtml = renderBar(createElement(NextStepBar, sampleProps));
assert(fallbackHtml === "", "expected bar to render nothing outside provider (pro fallback)");

console.log("next-step-bar-ok");
