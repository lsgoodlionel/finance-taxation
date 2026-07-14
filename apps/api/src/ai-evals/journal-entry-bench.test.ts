import { test } from "node:test";
import assert from "node:assert/strict";
import { runJournalEntryBench, GOLDEN_CASES } from "./journal-entry-bench.js";

const M4_ACCURACY_GATE = 0.8;

test("黄金集至少覆盖 15 条用例", () => {
  assert.ok(GOLDEN_CASES.length >= 15, `黄金集仅有 ${GOLDEN_CASES.length} 条，未达最低 15 条`);
});

test("M4 门禁：suggestAccountingEntry 分类准确率 >= 80%", () => {
  const result = runJournalEntryBench();

  if (result.accuracy < M4_ACCURACY_GATE) {
    const report = result.failures
      .map((f) => `  - [${f.name}] ${f.reason}`)
      .join("\n");
    console.error(
      `会计 Agent 自动分录准确率 ${(result.accuracy * 100).toFixed(1)}% 低于 M4 门禁 ${M4_ACCURACY_GATE * 100}%。\n失败用例：\n${report}`
    );
  }

  assert.ok(
    result.accuracy >= M4_ACCURACY_GATE,
    `accuracy ${result.accuracy} 低于 M4 门禁 ${M4_ACCURACY_GATE}`
  );
});
