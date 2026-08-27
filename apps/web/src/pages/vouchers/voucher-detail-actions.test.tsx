/**
 * 凭证详情**动作按钮的渲染条件**（V16）。
 *
 * ## 这个文件是为一个真实的、我自己造的 bug 写的
 *
 * V15 补「凭证红冲」入口时，按钮被写成了：
 *
 * ```tsx
 * {!isPosted && (
 *   …
 *   {detail.status === "posted" && <红冲按钮 />}   // ← 恒假
 * )}
 * ```
 *
 * 两个条件互斥，红冲按钮**从来没有渲染出来过**。而当时：
 * - `tsc --noEmit` 干净
 * - 1025 条单测全绿
 * - 前台入口护栏也绿——它查的是「前端源码里有没有出现 reverseVoucher」，
 *   而那个符号确实出现在 `lib/api.ts` 与 `VouchersPage.tsx` 里
 *
 * 三道防线全绿，按钮却不存在。提交信息里我还嘲讽了「手册承诺了一个不存在的按钮」，
 * 结果补的按钮同样不存在。
 *
 * **符号存在 ≠ 按钮可见。** 这一类只有把组件真的渲染一遍才看得见，
 * 所以这里逐个状态断言「该出现的出现了、不该出现的没出现」。
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { VoucherDetail } from "../../lib/api";
import { VoucherDetailPanel } from "./VoucherDetailPanel";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const BASE_DETAIL = {
  id: "vch-test-001",
  companyId: "cmp-1",
  businessEventId: "evt-1",
  voucherType: "accrual",
  summary: "测试凭证",
  voucherNumber: null,
  accountingDate: "2026-08-01",
  approvedAt: null,
  postedAt: null,
  source: "manual",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  postingRecords: [],
  lines: [
    {
      id: "line-1",
      voucherId: "vch-test-001",
      summary: "测试行",
      accountCode: "6602",
      accountName: "管理费用",
      debit: "100.00",
      credit: "0.00",
      sortOrder: 0
    }
  ]
};

function renderPanel(status: string, postedAt: string | null = null): string {
  const detail = { ...BASE_DETAIL, status, postedAt } as unknown as VoucherDetail;
  // 组件树里有 useNavigate（术语链接会跳转），必须给它一个 Router 上下文。
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(VoucherDetailPanel, {
      detail,
      validation: null,
      updating: false,
      onValidate: async () => {},
      onApprove: async () => {},
      onPost: async () => {},
      onReverse: async () => {},
      onSummaryUpdate: async () => {}
      })
    )
  );
}

const draftHtml = renderPanel("draft");
const reviewHtml = renderPanel("review_required");
const postedHtml = renderPanel("posted", "2026-08-02T00:00:00.000Z");

// ── 草稿：能校验、能审核；不能过账、不能红冲 ────────────────────────────────
assert(draftHtml.includes("借贷校验"), "草稿应当能做借贷校验");
assert(draftHtml.includes("审核通过"), "草稿应当有「审核通过」按钮");
assert(!draftHtml.includes("过账"), "草稿不该直接给「过账」——必须先复核");
assert(!draftHtml.includes("红冲"), "草稿不该有红冲：直接改就是了，摆个红冲会诱使人用它处理草稿");

// ── 待过账：能过账；不能重复审核、不能红冲 ──────────────────────────────────
assert(reviewHtml.includes("过账"), "待过账状态应当有「过账」按钮");
assert(!reviewHtml.includes("审核通过"), "已复核的凭证不该再给「审核通过」");
assert(!reviewHtml.includes("红冲"), "还没过账，没有可冲的分录");

// ── 已过账：只能红冲 ────────────────────────────────────────────────────────
//
// **这三条就是当初漏掉的那个 bug 的正面断言。**
assert(postedHtml.includes("红冲"), "已过账凭证必须有红冲入口——这是唯一合法的更正出口");
assert(!postedHtml.includes("审核通过"), "已过账不该再出现审核按钮");
assert(!postedHtml.includes("借贷校验"), "已过账凭证的动作区不该再挂校验按钮");

// ── 红冲按钮带危险样式 ──────────────────────────────────────────────────────
// 红冲会生成一张新凭证并影响账面，视觉上要和普通操作区分开。
assert(
  /ant-btn-dangerous|danger/.test(postedHtml),
  "红冲按钮应当是 danger 样式，与普通操作区分"
);

// 二次确认（Popconfirm）**无法在这里断言**：它的浮层内容只在点击后挂载，
// 服务端渲染的静态 HTML 里只有 children（按钮本身）。
// 那一层由 E2E 覆盖，不在这里假装测过。

console.log("voucher-detail-actions: 11 assertions passed");
