import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { AuditPageShell } from "./AuditPageShell";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const html = renderToStaticMarkup(
  createElement(MemoryRouter, null, createElement(AuditPageShell, {
    header: createElement("div", null, "audit-header"),
    filters: createElement("div", null, "audit-filters"),
    list: createElement("div", null, "audit-list"),
    detail: createElement("div", null, "audit-detail")
  }))
);

assert(html.includes("audit-header"), "expected audit shell header slot");
assert(html.includes("audit-filters"), "expected audit shell filters slot");
assert(html.includes("audit-list"), "expected audit shell list slot");
assert(html.includes("audit-detail"), "expected audit shell detail slot");
