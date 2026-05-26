import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ContractsShell } from "./ContractsShell";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const html = renderToStaticMarkup(
  createElement(ContractsShell, {
    header: createElement("div", null, "header"),
    createForm: createElement("div", null, "form"),
    filters: createElement("div", null, "filters"),
    list: createElement("div", null, "list"),
    detail: createElement("div", null, "detail")
  })
);

assert(html.includes("header"), "expected contracts shell header slot");
assert(html.includes("filters"), "expected contracts shell filters slot");
assert(html.includes("list"), "expected contracts shell list slot");
assert(html.includes("detail"), "expected contracts shell detail slot");
