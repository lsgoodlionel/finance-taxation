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
    summary: createElement("div", null, "summary"),
    sceneSelector: createElement("div", null, "sceneSelector"),
    content: createElement("div", null, "content"),
    context: createElement("div", null, "context")
  })
);

assert(html.includes("header"), "expected ledger shell header slot");
assert(html.includes("summary"), "expected ledger shell summary slot");
assert(html.includes("sceneSelector"), "expected ledger shell scene selector slot");
assert(html.includes("content"), "expected ledger shell content slot");
assert(html.includes("context"), "expected ledger shell context slot");
