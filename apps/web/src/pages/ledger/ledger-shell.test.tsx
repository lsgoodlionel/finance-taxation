import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LedgerShell } from "./LedgerShell";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const html = renderToStaticMarkup(
  createElement(LedgerShell, {
    header: createElement("div", null, "header"),
    children: createElement("div", null, "workspace")
  })
);

assert(html.includes("header"), "expected ledger shell header slot");
assert(html.includes("workspace"), "expected ledger shell workspace slot");

// 阅读顺序：页头 → 当前这件事
assert(html.indexOf("header") < html.indexOf("workspace"), "expected header before workspace");

/**
 * 首屏区块预算：外壳只允许留「页头」和「当前这件事」两段。
 * 改造前这里是 header / summary / sceneSelector / content / context 五段平铺，
 * 场景摘要与右侧上下文讲的还是同一批数字。
 */
const topLevelSections = html.match(/<section class="v3-[a-z-]+"/g) ?? [];
assert(
  topLevelSections.length === 2,
  `expected the ledger shell to render exactly 2 sections, got ${topLevelSections.length}`
);

/**
 * 全站 10 环节导航条不再出现在总账页：与 /tax 同理——它按当前页在数组里的下标算
 * done/current，与账本数据无关，本质是导航，左侧主菜单已经在做同一件事；
 * 而工作区里的切换器讲的是「这页我现在办哪件事」，两者同屏必混。
 */
assert(!html.includes("凭证记账"), "expected the global finance flow bar to be gone from /ledger");
assert(!html.includes("风险勾稽"), "expected no global navigation stages left in the ledger shell");

console.log("ledger-shell-ok");
