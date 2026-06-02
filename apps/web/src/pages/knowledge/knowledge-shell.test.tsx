import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { KnowledgeShell } from "./KnowledgeShell";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const html = renderToStaticMarkup(
  createElement(KnowledgeShell, {
    header: createElement("div", null, "header"),
    summary: createElement("div", null, "summary"),
    filters: createElement("div", null, "filters"),
    parsePanel: createElement("div", null, "parsePanel"),
    form: createElement("div", null, "form"),
    list: createElement("div", null, "list"),
    aside: createElement("div", null, "aside")
  })
);

assert(html.includes("header"), "expected knowledge shell header slot");
assert(html.includes("summary"), "expected knowledge shell summary slot");
assert(html.includes("filters"), "expected knowledge shell filters slot");
assert(html.includes("parsePanel"), "expected knowledge shell parse panel slot");
assert(html.includes("form"), "expected knowledge shell form slot");
assert(html.includes("list"), "expected knowledge shell list slot");
assert(html.includes("aside"), "expected knowledge shell aside slot");

// 可选槽位省略时不应渲染对应内容
const htmlMinimal = renderToStaticMarkup(
  createElement(KnowledgeShell, {
    header: createElement("div", null, "H"),
    summary: createElement("div", null, "S"),
    filters: createElement("div", null, "F"),
    list: createElement("div", null, "L"),
    aside: createElement("div", null, "A")
  })
);
assert(!htmlMinimal.includes("parsePanel"), "expected no parse panel when omitted");
