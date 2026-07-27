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
assert(html.includes('role="status"'), "expected non-error tone to use role=status for polite live announcement");

// ── a11y：error 语气需要 role="alert"（assertive），保证审批失败等关键状态被立即播报 ──
const errorHtml = renderToStaticMarkup(createElement(ResultBanner, { tone: "error", message: "提交失败" }));
assert(errorHtml.includes('role="alert"'), "expected error tone to use role=alert for assertive live announcement");
assert(errorHtml.includes('aria-live="assertive"'), "expected error tone aria-live=assertive");
