import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { RiskPageShell } from "./RiskPageShell";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const html = renderToStaticMarkup(
  createElement(MemoryRouter, null, createElement(RiskPageShell, {
    header: createElement("div", null, "risk-header"),
    list: createElement("div", null, "risk-list"),
    detail: createElement("div", null, "risk-detail"),
    timeline: createElement("div", null, "risk-timeline")
  }))
);

assert(html.includes("risk-header"), "expected risk shell header slot");
assert(html.includes("risk-list"), "expected risk shell list slot");
assert(html.includes("risk-detail"), "expected risk shell detail slot");
assert(html.includes("risk-timeline"), "expected risk shell timeline slot");
