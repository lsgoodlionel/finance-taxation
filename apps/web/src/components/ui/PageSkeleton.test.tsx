import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PageSkeleton } from "./PageSkeleton";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

// a11y 护栏：所有变体的加载骨架都必须带 role="status" + aria-live="polite"，
// 否则屏幕阅读器用户在页面加载期间会以为页面是空白/卡死的（WCAG 2.2 · SC 4.1.3）。
for (const variant of ["list", "detail", "dashboard", "form"] as const) {
  const html = renderToStaticMarkup(createElement(PageSkeleton, { variant }));
  assert(html.includes('role="status"'), `expected ${variant} skeleton to expose role="status"`);
  assert(html.includes('aria-live="polite"'), `expected ${variant} skeleton to expose aria-live="polite"`);
}
