import { test } from "node:test";
import assert from "node:assert/strict";
import { assessCompleteness } from "./completeness-agent.js";

test("销售事项缺发票与凭证时标记缺口", () => {
  const a = assessCompleteness({ type: "sales", hasContract: true, hasInvoice: false, hasDocument: false, hasVoucher: false });
  assert.deepEqual(a.missing, ["销项发票", "记账凭证"]);
  assert.ok(a.blocked);
  assert.ok(a.score < 1);
});

test("资料齐全时不阻塞且满分", () => {
  const a = assessCompleteness({ type: "expense", hasContract: false, hasInvoice: true, hasDocument: true, hasVoucher: true });
  assert.equal(a.missing.length, 0);
  assert.equal(a.score, 1);
  assert.equal(a.blocked, false);
});

test("未知类型不出清单不阻塞", () => {
  const a = assessCompleteness({ type: "general", hasContract: false, hasInvoice: false, hasDocument: false, hasVoucher: false });
  assert.equal(a.required.length, 0);
  assert.equal(a.blocked, false);
});

test("完整度分数按比例计算", () => {
  // procurement 需 4 项，齐 2 项 → 0.5
  const a = assessCompleteness({ type: "procurement", hasContract: true, hasInvoice: true, hasDocument: false, hasVoucher: false });
  assert.equal(a.score, 0.5);
});
