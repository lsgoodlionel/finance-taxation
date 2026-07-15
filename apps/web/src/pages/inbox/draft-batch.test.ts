import type { CloseDraft } from "../../lib/api";
import {
  computeDraftTotals,
  formatCny,
  getDraftGroupKey,
  groupDrafts,
  pruneIds,
  runSequentialBatch,
  sumSelectedAmount,
  summarizeBatchResult,
  toggleId,
  unionIds,
} from "./draft-batch";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function makeDraft(overrides: Partial<CloseDraft> & Pick<CloseDraft, "id">): CloseDraft {
  return {
    businessEventId: "evt-1",
    voucherType: "记",
    summary: `草稿 ${overrides.id}`,
    proposalLevel: "auto",
    balanced: true,
    status: "draft",
    lines: [
      { summary: "借", accountCode: "6602", accountName: "管理费用", debit: "100.00", credit: "0.00" },
      { summary: "贷", accountCode: "1002", accountName: "银行存款", debit: "0.00", credit: "100.00" },
    ],
    ...overrides,
  };
}

// ── 借贷合计与平衡校验 ─────────────────────────────────────────
{
  const totals = computeDraftTotals(makeDraft({ id: "d1" }).lines);
  assert(totals.debit === 100 && totals.credit === 100, "expected debit/credit totals of 100");
  assert(totals.isBalanced, "expected balanced totals");

  const unbalanced = computeDraftTotals([
    { summary: "借", accountCode: "6602", accountName: "管理费用", debit: "100.00", credit: "0.00" },
    { summary: "贷", accountCode: "1002", accountName: "银行存款", debit: "0.00", credit: "99.00" },
  ]);
  assert(!unbalanced.isBalanced, "expected unbalanced totals to fail check");

  const defensive = computeDraftTotals([
    { summary: "脏数据", accountCode: "1002", accountName: "银行存款", debit: "abc", credit: "" },
  ]);
  assert(defensive.debit === 0 && defensive.credit === 0, "expected invalid amounts to fall back to 0");
}

// ── 同类分组：凭证类型 + 科目组合，科目顺序无关 ─────────────────
{
  const a = makeDraft({ id: "a" });
  const b = makeDraft({
    id: "b",
    lines: [
      { summary: "贷", accountCode: "1002", accountName: "银行存款", debit: "0.00", credit: "50.00" },
      { summary: "借", accountCode: "6602", accountName: "管理费用", debit: "50.00", credit: "0.00" },
    ],
  });
  const c = makeDraft({
    id: "c",
    voucherType: "转",
  });
  assert(getDraftGroupKey(a) === getDraftGroupKey(b), "expected same account combo to share group key");
  assert(getDraftGroupKey(a) !== getDraftGroupKey(c), "expected different voucherType to split groups");

  const groups = groupDrafts([a, b, c]);
  assert(groups.length === 2, "expected 2 groups");
  assert(groups[0]?.ids.join(",") === "a,b", "expected first group to keep insertion order a,b");
  assert(groups[0]?.label === "记 · 1002/6602", "expected group label with sorted account codes");
  assert(groups[1]?.ids.join(",") === "c", "expected second group to contain c only");
}

// ── 勾选集合操作：不可变 + 悬空清理 ────────────────────────────
{
  const initial: ReadonlySet<string> = new Set(["a"]);
  const toggledOn = toggleId(initial, "b");
  assert(initial.size === 1, "expected toggleId not to mutate original set");
  assert(toggledOn.has("a") && toggledOn.has("b"), "expected toggleId to add missing id");
  assert(!toggleId(toggledOn, "a").has("a"), "expected toggleId to remove existing id");

  const merged = unionIds(initial, ["a", "b", "c"]);
  assert(merged.size === 3 && initial.size === 1, "expected unionIds to merge without mutation");

  const pruned = pruneIds(merged, new Set(["b", "c"]));
  assert(pruned.size === 2 && !pruned.has("a"), "expected pruneIds to drop dead ids");
  assert(pruneIds(pruned, new Set(["b", "c"])) === pruned, "expected pruneIds to return same ref when unchanged");
}

// ── 金额合计：只累计已选草稿的借方合计 ─────────────────────────
{
  const drafts = [makeDraft({ id: "a" }), makeDraft({ id: "b" }), makeDraft({ id: "c" })];
  assert(sumSelectedAmount(drafts, new Set(["a", "c"])) === 200, "expected sum of selected debit totals");
  assert(sumSelectedAmount(drafts, new Set()) === 0, "expected empty selection to sum 0");
  assert(formatCny(1234.5) === "¥1,234.50", "expected CNY format with thousands separator");
}

// ── 顺序批量执行：进度归约 + 单条失败不中断 + 失败汇总 ─────────
{
  const calls: string[] = [];
  const progress: Array<[number, number]> = [];
  const action = async (id: string) => {
    calls.push(id);
    if (id === "bad") throw new Error("余额不足");
  };
  const targets = [
    { id: "ok1", summary: "草稿一" },
    { id: "bad", summary: "草稿二" },
    { id: "ok2", summary: "草稿三" },
  ];

  const result = await runSequentialBatch(targets, action, (done, total) => progress.push([done, total]));
  assert(calls.join(",") === "ok1,bad,ok2", "expected sequential calls without interruption on failure");
  assert(progress.map((p) => p.join("/")).join(",") === "1/3,2/3,3/3", "expected progress 1/3 → 3/3");
  assert(result.succeeded.join(",") === "ok1,ok2", "expected 2 successes");
  assert(result.failed.length === 1, "expected 1 failure");
  assert(result.failed[0]?.summary === "草稿二" && result.failed[0]?.message === "余额不足",
    "expected failure to carry summary and reason");

  assert(summarizeBatchResult("批准", result) === "批量批准完成：成功 2 条，失败 1 条",
    "expected mixed summary text");
  assert(summarizeBatchResult("驳回", { succeeded: ["a"], failed: [] }) === "批量驳回完成：成功 1 条",
    "expected all-success summary without failure part");

  const emptyResult = await runSequentialBatch([], action);
  assert(emptyResult.succeeded.length === 0 && emptyResult.failed.length === 0,
    "expected empty targets to yield empty result");

  const nonErrorFailure = await runSequentialBatch(
    [{ id: "weird", summary: "草稿四" }],
    async () => { throw "boom"; }
  );
  assert(nonErrorFailure.failed[0]?.message === "未知错误", "expected non-Error throw to map to fallback message");
}

console.log("draft-batch tests passed");
