import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { ProPageBanner, ProPageBannerContent } from "./ProPageBanner";
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
  pageName: "总账中心",
  plain: "这里是账本的原始记录，查账对账由财务同事完成。",
};

function renderBanner(node: ReactElement): string {
  return renderToStaticMarkup(createElement(MemoryRouter, null, node));
}

// ── 内容渲染：标题 + 白话解释 + 两个出口按钮 ────────────────────────────────
const contentHtml = renderBanner(createElement(ProPageBannerContent, sampleProps));
assert(contentHtml.includes("这是财务专业页面"), "expected professional-page headline");
assert(contentHtml.includes("总账中心"), "expected page name in headline");
assert(contentHtml.includes("这里是账本的原始记录"), "expected page-specific plain explanation");
assert(contentHtml.includes("这页平时由财务同事操作"), "expected shared reassurance line");
assert(contentHtml.includes("回今天"), "expected 回今天 exit button");
assert(contentHtml.includes("问 AI"), "expected 问 AI exit button");
assert(contentHtml.includes("专业页面提示"), "expected accessible aria label");

// ── guided 模式：渲染横幅 ───────────────────────────────────────────────────
stubStoredMode("guided");
const guidedHtml = renderBanner(
  createElement(WorkspaceModeProvider, null, createElement(ProPageBanner, sampleProps))
);
assert(guidedHtml.includes("这是财务专业页面"), "expected banner to render in guided mode");
assert(guidedHtml.includes("回今天"), "expected exits to render in guided mode");
assert(guidedHtml.includes("问 AI"), "expected assistant exit to render in guided mode");

// ── pro 模式：返回 null ─────────────────────────────────────────────────────
stubStoredMode("pro");
const proHtml = renderBanner(
  createElement(WorkspaceModeProvider, null, createElement(ProPageBanner, sampleProps))
);
assert(proHtml === "", "expected banner to render nothing in pro mode");

// Provider 外（安全回退 pro）同样不渲染
delete (globalThis as { window?: unknown }).window;
const fallbackHtml = renderBanner(createElement(ProPageBanner, sampleProps));
assert(fallbackHtml === "", "expected banner to render nothing outside provider (pro fallback)");

console.log("pro-page-banner-ok");
