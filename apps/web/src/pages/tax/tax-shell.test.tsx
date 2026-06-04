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
    summary: createElement("div", null, "summary"),
    taxItems: createElement("div", null, "taxItems"),
    batches: createElement("div", null, "batches"),
    materials: createElement("div", null, "materials")
  }))
);

assert(html.includes("header"), "expected tax shell header slot");
assert(html.includes("guidance"), "expected tax shell guidance slot");
assert(html.includes("summary"), "expected tax shell summary slot");
assert(html.includes("taxItems"), "expected tax shell items slot");
assert(html.includes("batches"), "expected tax shell batches slot");
assert(html.includes("materials"), "expected tax shell materials slot");
