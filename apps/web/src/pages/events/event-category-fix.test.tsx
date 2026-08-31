import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EventDetailActions } from "./EventDetailActions";

/**
 * 事项详情里能改应税行为类别（V17 阶段二）。
 *
 * ## 为什么录入入口不够
 *
 * 只在建的时候能选，等于假设用户不会选错。事项一旦建好就可能已经派生了
 * 税项与凭证——重建一笔的代价远大于改一个字段，而用户面对「只能重建」
 * 的实际做法是**将错就错**，那笔业务就一直按错的税率算下去。
 *
 * 服务端已经收下了这个改动（PUT /api/events/:id），但服务端能收
 * **不等于用户点得到**——V16 红冲按钮写成两个互斥条件、前台入口护栏照样绿，
 * 就是这么漏的。这条测试盯的是入口真的渲染出来。
 */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const CATEGORIES = [
  { value: "goods", label: "销售货物", rateCode: "vat_basic", rateHint: "13%" },
  { value: "modern_service", label: "现代服务", rateCode: "vat_service", rateHint: "6%" }
];

function render(overrides: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    createElement(EventDetailActions, {
      statusDraft: "draft",
      isBusy: false,
      taxableCategories: CATEGORIES,
      categoryDraft: "goods",
      onCategoryDraftChange: () => {},
      onCategoryUpdate: () => {},
      onStatusDraftChange: () => {},
      onAnalyze: () => {},
      onRiskCheck: () => {},
      onStatusUpdate: () => {},
      ...overrides
    } as never)
  );
}

// ── 改正入口在详情页上 ──────────────────────────────────────────────────
{
  const html = render();
  assert(
    html.includes("现代服务") && html.includes("销售货物"),
    "详情页要能改类别——只在建的时候能选，等于假设用户不会选错"
  );
  assert(html.includes("6%") && html.includes("13%"), "改的时候同样要看到税率");

  const selected = /<option value="goods"[^>]*selected/.test(html);
  assert(selected, "当前类别要是选中态，用户才看得出现在标的是什么");
}

// ── 没有类别清单时不渲染这个入口，而不是渲染一个空选择器 ────────────────
{
  const html = render({ taxableCategories: [] });
  assert(
    !html.includes("应税行为类别"),
    "清单拉不到时不该给一个空的选择器——那看起来像「没有类别可选」，是误导"
  );
}

console.log("event-category-fix: ok");
