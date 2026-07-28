import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { DocumentsShell } from "./DocumentsShell";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const html = renderToStaticMarkup(
  createElement(MemoryRouter, null, createElement(DocumentsShell, {
    summary: createElement("div", null, "summary"),
    list: createElement("div", null, "list"),
    detail: createElement("div", null, "detail")
  }))
);

assert(html.includes("summary"), "expected documents shell summary slot");
assert(html.includes("list"), "expected documents shell list slot");
assert(html.includes("detail"), "expected documents shell detail slot");
assert(html.includes("v3-result-grid"), "expected result grid class");

/**
 * V10：单据只是 /bills 承载的三件事之一，壳层（横幅 / 标题 / 业务链路条）由容器出一份。
 * 子页再自带一份，用户就会在同一屏看到两个标题、两条链路条。
 */
assert(!html.includes("v3-hero-shell"), "expected the duplicated hero header to move to the /bills container");
assert(!html.includes("单据补齐"), "expected the global finance flow bar to be gone from the documents body");
assert(!html.includes("凭证记账"), "expected no second finance flow bar inside the tab body");

console.log("documents-shell-ok");
