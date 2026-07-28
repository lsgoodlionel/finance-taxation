import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { TaxShell } from "./TaxShell";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const html = renderToStaticMarkup(
  createElement(MemoryRouter, null, createElement(TaxShell, {
    header: createElement("div", null, "header"),
    guidance: createElement("div", null, "guidance"),
    children: createElement("div", null, "workspace")
  }))
);

assert(html.includes("header"), "expected tax shell header slot");
assert(html.includes("guidance"), "expected tax shell guidance slot");
assert(html.includes("workspace"), "expected tax shell workspace slot");

// 阅读顺序：页头 → 反馈 → 当前这件事
assert(
  html.indexOf("header") < html.indexOf("guidance") && html.indexOf("guidance") < html.indexOf("workspace"),
  "expected header/guidance/workspace reading order"
);

// guidance 可省略时不留空壳
const bare = renderToStaticMarkup(
  createElement(MemoryRouter, null, createElement(TaxShell, {
    header: createElement("div", null, "header"),
    children: createElement("div", null, "workspace")
  }))
);
assert(bare.includes("workspace"), "expected workspace without guidance");

/**
 * 全站 10 环节导航条不再出现在税务页：它与工作区里的 ObjectFlowBar 是两种流程、
 * 外观相近，同屏会让用户分不清「系统有哪些环节」和「我这一笔卡在哪」。
 */
assert(!html.includes("凭证记账"), "expected the global finance flow bar to be gone from /tax");
assert(!html.includes("风险勾稽"), "expected no global navigation stages left in the tax shell");

console.log("tax-shell-ok");
