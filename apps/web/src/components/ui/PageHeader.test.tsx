import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PageHeader } from "./PageHeader";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const html = renderToStaticMarkup(createElement(PageHeader, { title: "经营事项总线", subtitle: "入口页" }));
assert(html.includes("经营事项总线"), "expected title");
assert(html.includes("入口页"), "expected subtitle");
