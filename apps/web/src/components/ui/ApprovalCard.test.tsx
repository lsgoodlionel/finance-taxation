import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { ApprovalCard } from "./ApprovalCard";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function renderCard(props: Parameters<typeof ApprovalCard>[0]): string {
  return renderToStaticMarkup(createElement(MemoryRouter, null, createElement(ApprovalCard, props)));
}

// ── guided 形态：白话标题 + 影响说明 + 大金额 + 三键 ─────────────────────────
const guidedHtml = renderCard({
  variant: "guided",
  title: "AI 起草了一张 5,200 元的记账凭证，等您确认",
  impact: "确认后交财务复核入账，不会直接改动账本",
  amount: 5200,
  detailPath: "/inbox",
  onApprove: () => undefined,
  onReject: () => undefined
});
assert(guidedHtml.includes("AI 起草了一张 5,200 元的记账凭证"), "expected guided title");
assert(guidedHtml.includes("确认后交财务复核入账"), "expected guided impact line");
assert(guidedHtml.includes("¥5,200.00"), "expected formatted amount");
assert(guidedHtml.includes("批准"), "expected approve button");
assert(guidedHtml.includes("驳回"), "expected reject button");
assert(guidedHtml.includes("看详情"), "expected detail link");
assert(guidedHtml.includes('href="/inbox"'), "expected detail link path");
assert(guidedHtml.includes("min-height:44px"), "expected guided touch-friendly button height");

// ── pro 形态：紧凑 + 借贷金额显示 ────────────────────────────────────────────
const proHtml = renderCard({
  variant: "pro",
  title: "计提 7 月房租",
  amount: 5200,
  lines: [
    { summary: "计提房租", accountLabel: "6602 管理费用", debit: "5200.00", credit: "0" },
    { summary: "计提房租", accountLabel: "2202 应付账款", debit: "0", credit: "5200.00" }
  ],
  onApprove: () => undefined,
  onReject: () => undefined
});
assert(proHtml.includes("计提 7 月房租"), "expected pro title");
assert(proHtml.includes("6602 管理费用"), "expected pro debit account line");
assert(proHtml.includes("借 ¥5,200.00"), "expected pro debit amount");
assert(proHtml.includes("贷 ¥5,200.00"), "expected pro credit amount");
assert(!proHtml.includes("min-height:44px"), "expected pro compact buttons");

// ── 无审批回调的纯提醒卡：只渲染「看详情」 ───────────────────────────────────
const infoHtml = renderCard({
  variant: "guided",
  title: "发现 2 个高风险事项，建议尽快处理",
  impact: "点击查看具体是哪几件事",
  detailPath: "/risk"
});
assert(!infoHtml.includes("批准"), "expected no approve button without handler");
assert(!infoHtml.includes("驳回"), "expected no reject button without handler");
assert(infoHtml.includes("看详情"), "expected detail link on info card");
assert(!infoHtml.includes("¥"), "expected no amount block when amount missing");
