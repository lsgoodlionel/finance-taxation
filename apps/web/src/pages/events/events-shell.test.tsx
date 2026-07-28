import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { EventsShell } from "./EventsShell";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const VOID_TAGS = new Set(["br", "hr", "img", "input", "link", "meta", "source"]);

/** 数根容器下的直接子元素——「顶层区块」在实测里就是按这个数的。 */
function countTopLevelBlocks(markup: string): number {
  let depth = 0;
  let count = 0;
  for (const match of markup.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>/g)) {
    const [, closing, name, , selfClose] = match;
    if (closing) {
      depth -= 1;
      continue;
    }
    if (depth === 1) count += 1;
    if (!VOID_TAGS.has((name ?? "").toLowerCase()) && !selfClose) depth += 1;
  }
  return count;
}

const html = renderToStaticMarkup(
  createElement(MemoryRouter, null, createElement(EventsShell, {
    header: createElement("div", null, "header"),
    banner: createElement("div", null, "banner"),
    listPanel: createElement("div", null, "list"),
    detailPanel: createElement("div", null, "detail")
  }))
);

assert(html.includes("header"), "expected events shell header slot");
assert(html.includes("banner"), "expected events shell banner slot");
assert(html.includes("list"), "expected events shell list slot");
assert(html.includes("detail"), "expected events shell detail slot");
// 新建表单已收进对话框：骨架不该再出现「新建经营事项」这块常驻表单。
assert(!html.includes("新建经营事项"), "events shell should not render the create form inline");

// 顶层区块上限：页头 / 全站流程条 / 工作区。改造前是 6（pro）～8（guided）块。
const blocks = countTopLevelBlocks(html);
assert(blocks === 3, `expected 3 top-level blocks on /events, got ${blocks}`);
