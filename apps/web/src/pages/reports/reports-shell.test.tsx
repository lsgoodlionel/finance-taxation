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
    sidebar: createElement("div", null, "sidebar"),
    workbench: createElement("div", null, "workbench"),
  }))
);

assert(html.includes("header"), "expected reports shell header slot");
assert(html.includes("sidebar"), "expected reports shell sidebar slot");
assert(html.includes("workbench"), "expected reports shell workbench slot");
