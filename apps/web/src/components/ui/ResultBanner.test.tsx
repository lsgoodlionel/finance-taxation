import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ResultBanner } from "./ResultBanner";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const html = renderToStaticMarkup(createElement(ResultBanner, { tone: "warning", message: "需要复核" }));
assert(html.includes("需要复核"), "expected banner text");
assert(html.includes("data-tone=\"warning\""), "expected warning tone");
