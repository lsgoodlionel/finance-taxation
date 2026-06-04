import { test } from "node:test";
import assert from "node:assert/strict";
import { consolidateFeedback, type FeedbackItem } from "./consolidate.js";

const mk = (o: Partial<FeedbackItem>): FeedbackItem => ({ id: "f", category: "suggestion", title: "t", module: "", votes: 0, ...o });

test("空反馈返回 null", () => {
  assert.equal(consolidateFeedback([]), null);
});

test("浓缩含来源 id 与计数", () => {
  const p = consolidateFeedback([mk({ id: "1" }), mk({ id: "2" })])!;
  assert.equal(p.sourceCount, 2);
  assert.deepEqual(p.sourceIds, ["1", "2"]);
});

test("多缺陷判为高优先级", () => {
  const p = consolidateFeedback([mk({ category: "bug" }), mk({ category: "bug" }), mk({ category: "bug" })])!;
  assert.equal(p.priority, "high");
});

test("高票数判为高优先级", () => {
  const p = consolidateFeedback([mk({ votes: 25 })])!;
  assert.equal(p.priority, "high");
});

test("少量普通建议为低优先级", () => {
  const p = consolidateFeedback([mk({ votes: 1 })])!;
  assert.equal(p.priority, "low");
});

test("摘要按类别分组并列出标题", () => {
  const p = consolidateFeedback([mk({ category: "bug", title: "崩溃" }), mk({ category: "suggestion", title: "加导出" })])!;
  assert.match(p.summary, /缺陷修复/);
  assert.match(p.summary, /功能建议/);
  assert.match(p.summary, /崩溃/);
});
