import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EntityDrawer } from "./EntityDrawer";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const html = renderToStaticMarkup(
  createElement(
    EntityDrawer,
    { title: "详情", children: createElement("div", null, "内容") }
  )
);

assert(html.includes("详情"), "expected drawer title");
assert(html.includes("内容"), "expected drawer body");
