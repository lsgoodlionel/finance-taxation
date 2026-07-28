import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { ReportsShell } from "./ReportsShell";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const html = renderToStaticMarkup(
  createElement(MemoryRouter, null, createElement(ReportsShell, {
    header: createElement("div", null, "header"),
    children: createElement("div", null, "workbench")
  }))
);

assert(html.includes("header"), "expected reports shell header slot");
assert(html.includes("workbench"), "expected reports shell workbench slot");
// 侧栏已下线：壳层不再有第二列，四件事收进任务切换器。
assert(!html.includes("v3-result-grid"), "expected the two-column sidebar grid to be gone");
assert(html.includes("财务报表"), "expected the finance flow bar to stay in the shell");
