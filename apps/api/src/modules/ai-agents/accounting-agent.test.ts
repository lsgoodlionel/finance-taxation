import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestAccountingEntry } from "./accounting-agent.js";

test("销售事项建议确认收入分录", () => {
  const s = suggestAccountingEntry({ id: "e1", type: "sales", title: "软件销售", amount: 10000 });
  assert.equal(s.templateKey, "sales");
  assert.ok(s.lines.length >= 2);
  const debit = s.lines.reduce((a, l) => a + Number(l.debit), 0);
  const credit = s.lines.reduce((a, l) => a + Number(l.credit), 0);
  assert.equal(debit, credit); // 借贷平衡
});

test("费用事项映射管理费用模板", () => {
  const s = suggestAccountingEntry({ id: "e2", type: "expense", title: "差旅费", amount: 500 });
  assert.equal(s.templateKey, "expense");
  assert.ok(s.confidence > 0.5);
});

test("未知类型不出分录并标记需复核", () => {
  const s = suggestAccountingEntry({ id: "e3", type: "general", title: "其他", amount: 100 });
  assert.equal(s.templateKey, null);
  assert.equal(s.lines.length, 0);
  assert.ok(s.needsReview);
});

test("金额为零不出分录", () => {
  const s = suggestAccountingEntry({ id: "e4", type: "sales", title: "无金额", amount: 0 });
  assert.equal(s.lines.length, 0);
  assert.ok(s.needsReview);
});

test("金额缺失（null）安全处理", () => {
  const s = suggestAccountingEntry({ id: "e5", type: "procurement", title: "采购", amount: null });
  assert.equal(s.lines.length, 0);
});
