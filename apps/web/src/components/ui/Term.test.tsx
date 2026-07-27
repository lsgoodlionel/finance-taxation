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

// ── V8 D1 可达性：键盘可聚焦 + 读屏可识别 + 释义直接挂在 aria-label 上 ───────
assert(proHtml.includes('tabindex="0"'), "expected term trigger to be keyboard focusable");
assert(proHtml.includes('role="button"'), "expected term trigger to expose an interactive role");
assert(
  proHtml.includes('aria-label="过账：把审核通过的凭证正式记入公司账本'),
  "expected pro mode aria-label to carry term and explanation"
);

// ── V9 非交互变体：不制造嵌套可聚焦元素，但释义仍进入无障碍树 ───────────────
const staticHtml = renderToStaticMarkup(
  createElement(Term, { k: "reconciliation", interactive: false }, "勾稽")
);
assert(staticHtml.includes("勾稽"), "expected non-interactive mode to render the original term");
assert(staticHtml.includes("dashed"), "expected non-interactive mode to keep the underline hint");
assert(
  !staticHtml.includes('tabindex="0"'),
  "expected non-interactive mode to stay out of the tab order (no nested interactive)"
);
assert(
  !staticHtml.includes('role="button"'),
  "expected non-interactive mode to expose no interactive role"
);
assert(
  staticHtml.includes("：把不同来源的数据互相核对"),
  "expected non-interactive mode to carry the explanation as accessible text"
);
assert(
  !staticHtml.includes("cursor:help"),
  "expected non-interactive mode to inherit the container cursor"
);
// 隐藏文本必须留在无障碍树里：只做视觉隐藏，不得 display:none / visibility:hidden。
assert(staticHtml.includes("clip:rect(0, 0, 0, 0)"), "expected visually-hidden clip technique");
assert(
  !staticHtml.includes("display:none") && !staticHtml.includes("visibility:hidden"),
  "expected explanation to remain in the accessibility tree"
);

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
const guidedStaticHtml = renderToStaticMarkup(
  createElement(
    WorkspaceModeProvider,
    null,
    createElement(Term, { k: "posting", interactive: false }, "过账")
  )
);
delete (globalThis as Record<string, unknown>).window;
assert(guidedHtml.includes("记入正式账本"), "expected guided mode to render plain wording");
assert(guidedHtml.includes("（过账）"), "expected guided mode to annotate original term");
assert(guidedHtml.includes("dashed"), "expected dashed underline hint in guided mode");
assert(guidedHtml.includes('tabindex="0"'), "expected guided term trigger to be keyboard focusable");
assert(
  guidedHtml.includes('aria-label="记入正式账本（过账）：'),
  "expected guided aria-label to carry plain wording, original term and explanation"
);

// ── guided 的白话括注在非交互变体下保持一致 ─────────────────────────────────
assert(
  guidedStaticHtml.includes("记入正式账本") && guidedStaticHtml.includes("（过账）"),
  "expected non-interactive mode to keep guided plain wording and annotation"
);
assert(
  !guidedStaticHtml.includes('tabindex="0"'),
  "expected guided non-interactive mode to stay out of the tab order"
);
assert(
  guidedStaticHtml.includes("：把审核通过的凭证正式记入公司账本"),
  "expected guided non-interactive mode to carry the explanation as accessible text"
);

// ── 未命中词条不应引入多余的可聚焦节点 ─────────────────────────────────────
assert(!missHtml.includes('tabindex="0"'), "expected unknown key to stay non-interactive");
