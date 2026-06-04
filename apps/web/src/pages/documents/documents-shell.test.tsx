import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { DocumentsShell } from "./DocumentsShell";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const html = renderToStaticMarkup(
  createElement(MemoryRouter, null, createElement(DocumentsShell, {
    header: createElement("div", null, "header"),
    summary: createElement("div", null, "summary"),
    list: createElement("div", null, "list"),
    detail: createElement("div", null, "detail")
  }))
);

assert(html.includes("header"), "expected documents shell header slot");
assert(html.includes("summary"), "expected documents shell summary slot");
assert(html.includes("list"), "expected documents shell list slot");
assert(html.includes("detail"), "expected documents shell detail slot");
assert(html.includes("v3-hero-shell"), "expected hero shell class");
assert(html.includes("v3-result-grid"), "expected result grid class");
