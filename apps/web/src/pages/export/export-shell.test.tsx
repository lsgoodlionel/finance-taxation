import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ExportShell } from "./ExportShell";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const html = renderToStaticMarkup(
  createElement(ExportShell, {
    header: createElement("div", null, "header"),
    guidance: createElement("div", null, "guidance"),
    sceneSelector: createElement("div", null, "sceneSelector"),
    history: createElement("div", null, "history"),
    archive: createElement("div", null, "archive"),
    content: createElement("div", null, "content")
  })
);

assert(html.includes("header"), "expected export shell header slot");
assert(html.includes("sceneSelector"), "expected export shell scene selector slot");
assert(html.includes("history"), "expected export shell history slot");
assert(html.includes("archive"), "expected export shell archive slot");
assert(html.includes("content"), "expected export shell content slot");
