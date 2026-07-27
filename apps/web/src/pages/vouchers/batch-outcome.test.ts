/**
 * V8 · 批量结果呈现决策单测：汇总不丢失 + 部分失败不给绿色成功提示。
 */
import { buildBatchOutcome, buildRefreshFailedMessage } from "./batch-outcome";
import type { BatchItemResult } from "./voucher-actions";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const ok = (id: string): BatchItemResult => ({ id, ok: true, message: "成功" });
const bad = (id: string, message: string): BatchItemResult => ({ id, ok: false, message });
const successToast = (count: number) => `已过账 ${count} 张凭证，将影响总账和报表`;

// ── 全部成功：绿色成功提示 + 成功样式汇总 ────────────────────────────────────
const allOk = buildBatchOutcome("批量过账", [ok("v1"), ok("v2")], successToast);
assertEqual(allOk.succeededCount, 2, "expected 2 succeeded");
assertEqual(allOk.failedCount, 0, "expected 0 failed");
assertEqual(allOk.summaryTone, "success", "expected success summary tone");
assertEqual(allOk.summaryTitle, "批量过账完成：成功 2 张", "expected success summary title");
assertEqual(allOk.toastKind, "success", "expected success toast when nothing failed");

// ── 部分失败：不给绿色成功提示，文案必须带失败数 ─────────────────────────────
const partial = buildBatchOutcome("批量过账", [ok("v1"), bad("v2", "期间已锁")], successToast);
assertEqual(partial.succeededCount, 1, "expected 1 succeeded on partial failure");
assertEqual(partial.failedCount, 1, "expected 1 failed on partial failure");
assertEqual(partial.toastKind, "warning", "partial failure must not use a green success toast");
assert(partial.toastMessage.includes("1 张失败"), "partial failure toast must state the failed count");
assertEqual(
  partial.summaryTitle,
  "批量过账完成：成功 1 张，失败 1 张",
  "expected partial summary title to carry both counts"
);
assertEqual(partial.summaryTone, "warning", "expected warning summary tone on partial failure");

// ── 全部失败：错误提示 + 汇总仍然给出（结果不丢失） ──────────────────────────
const allBad = buildBatchOutcome("批量审核", [bad("v1", "借贷不平"), bad("v2", "借贷不平")], successToast);
assertEqual(allBad.toastKind, "error", "expected error toast when nothing succeeded");
assertEqual(
  allBad.summaryTitle,
  "批量审核完成：成功 0 张，失败 2 张",
  "expected summary title even when everything failed"
);

// ── 刷新失败文案：结果已生效，不能说成操作失败 ───────────────────────────────
const refreshMessage = buildRefreshFailedMessage("批量过账");
assert(refreshMessage.includes("结果已生效"), "refresh failure must state the result already took effect");
assert(refreshMessage.includes("手动刷新"), "refresh failure must tell the user to refresh manually");
assert(!refreshMessage.includes("未成功"), "refresh failure must not read as an operation failure");
