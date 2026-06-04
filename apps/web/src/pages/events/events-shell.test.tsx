import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { EventsShell } from "./EventsShell";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const html = renderToStaticMarkup(
  createElement(MemoryRouter, null, createElement(EventsShell, {
    header: createElement("div", null, "header"),
    banner: createElement("div", null, "banner"),
    createPanel: createElement("div", null, "create"),
    listPanel: createElement("div", null, "list"),
    detailPanel: createElement("div", null, "detail")
  }))
);

assert(html.includes("header"), "expected events shell header slot");
assert(html.includes("create"), "expected events shell create slot");
assert(html.includes("list"), "expected events shell list slot");
assert(html.includes("detail"), "expected events shell detail slot");
