import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AssistantShell } from "./AssistantShell";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const html = renderToStaticMarkup(
  createElement(AssistantShell, {
    header: createElement("div", null, "header"),
    flow: createElement("div", null, "flow"),
    status: createElement("div", null, "status"),
    history: createElement("div", null, "history"),
    chat: createElement("div", null, "chat"),
    composer: createElement("div", null, "composer")
  })
);

assert(html.includes("header"), "expected shell header slot");
assert(html.includes("flow"), "expected shell flow slot");
assert(html.includes("chat"), "expected shell chat slot");
assert(html.includes("composer"), "expected shell composer slot");
