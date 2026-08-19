/**
 * 发票匹配打分的单测（V14-D）。
 *
 * 「为什么这张票排在前面」是用户会问的问题，答案必须可复现——
 * 所以每一条得分规则都单独钉住。
 */

import assert from "node:assert/strict";
import test from "node:test";
import { rankInvoices, scoreInvoice, type InvoiceCandidate, type MatchTarget } from "./match.js";

const TARGET: MatchTarget = {
  amountCents: 120_000,
  expenseOn: "2026-04-15",
  keyword: "某某酒店"
};

function invoice(overrides: Partial<InvoiceCandidate> = {}): InvoiceCandidate {
  return {
    id: "inv-1",
    invoiceNo: "00000001",
    invoiceDate: "2026-04-15",
    sellerName: "某某酒店管理有限公司",
    totalAmountCents: 120_000,
    verifyStatus: "verified",
    ...overrides
  };
}

test("四项全中拿满分", () => {
  const result = scoreInvoice(TARGET, invoice());
  // 50 金额 + 20 日期 + 15 销方 + 5 已验真
  assert.equal(result.score, 90);
  assert.equal(result.reasons.length, 4);
});

test("金额的两档互斥——相等就不再算接近", () => {
  const exact = scoreInvoice(TARGET, invoice());
  const close = scoreInvoice(TARGET, invoice({ totalAmountCents: 120_050 }));

  // 若两档叠加，相等的会拿 80 分而接近的拿 30，档位差距被人为拉大、排序失真。
  assert.equal(exact.score - close.score, 20);
  assert.ok(exact.reasons.some((r) => r.includes("完全一致")));
  assert.ok(close.reasons.some((r) => r.includes("相差 0.50 元")));
});

test("金额差超过 1 元不给分", () => {
  const result = scoreInvoice(TARGET, invoice({ totalAmountCents: 120_101 }));
  assert.equal(result.reasons.some((r) => r.includes("金额")), false);
});

test("日期窗口是前后 7 天，边界含在内", () => {
  const inWindow = scoreInvoice(TARGET, invoice({ invoiceDate: "2026-04-22" }));
  const outWindow = scoreInvoice(TARGET, invoice({ invoiceDate: "2026-04-23" }));

  assert.ok(inWindow.reasons.some((r) => r.includes("相差 7 天")));
  assert.equal(outWindow.reasons.some((r) => r.includes("天")), false);
  assert.equal(inWindow.score - outWindow.score, 20);

  // 前后对称：早 7 天与晚 7 天同等对待。
  const before = scoreInvoice(TARGET, invoice({ invoiceDate: "2026-04-08" }));
  assert.equal(before.score, inWindow.score);
});

test("关键词为 null 时整项跳过，不误加分", () => {
  // 空串会让 includes 恒真，把所有票都加 15 分——那等于这一项没有区分度。
  const noKeyword = scoreInvoice({ ...TARGET, keyword: null }, invoice());
  const emptyKeyword = scoreInvoice({ ...TARGET, keyword: "   " }, invoice());

  assert.equal(noKeyword.score, 75);
  assert.equal(emptyKeyword.score, 75, "空白关键词不该给分");
});

test("销方名为空的票不因此报错", () => {
  const result = scoreInvoice(TARGET, invoice({ sellerName: null }));
  assert.equal(result.reasons.some((r) => r.includes("销方")), false);
  assert.equal(result.score, 75);
});

test("零分的票也返回——藏起来会让人以为票不在池子里", () => {
  // 用户自己贴的票据可能开票日离费用日很远、金额是几张合并的。
  // 把它们藏起来，用户会转而去手工录一张重复的。
  const unrelated = invoice({
    id: "inv-far",
    invoiceNo: "99999999",
    totalAmountCents: 999_999,
    invoiceDate: "2025-01-01",
    sellerName: "毫不相干的公司",
    verifyStatus: null
  });

  const ranked = rankInvoices(TARGET, [unrelated]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0]!.score, 0);
  assert.deepEqual(ranked[0]!.reasons, []);
});

test("按分数降序排，同分按日期接近程度", () => {
  const near = invoice({ id: "near", invoiceNo: "A", invoiceDate: "2026-04-16" });
  const far = invoice({ id: "far", invoiceNo: "B", invoiceDate: "2026-04-20" });
  const weak = invoice({
    id: "weak",
    invoiceNo: "C",
    totalAmountCents: 500_000,
    sellerName: null,
    verifyStatus: null
  });

  const ranked = rankInvoices(TARGET, [weak, far, near]);
  assert.deepEqual(
    ranked.map((item) => item.invoice.id),
    ["near", "far", "weak"]
  );
});

test("分数与日期都相同时排序稳定", () => {
  // 顺序不稳定会让同一次查询两次刷新出不同的排列，用户会以为数据在变。
  const a = invoice({ id: "a", invoiceNo: "00000002" });
  const b = invoice({ id: "b", invoiceNo: "00000001" });

  const first = rankInvoices(TARGET, [a, b]).map((item) => item.invoice.id);
  const second = rankInvoices(TARGET, [b, a]).map((item) => item.invoice.id);

  assert.deepEqual(first, second);
  assert.deepEqual(first, ["b", "a"], "同分同日期应按发票号排");
});

test("非法日期不炸，只是拿不到日期分", () => {
  const result = scoreInvoice(TARGET, invoice({ invoiceDate: "不是日期" }));
  assert.equal(Number.isFinite(result.dayGap), false);
  assert.equal(result.reasons.some((r) => r.includes("天")), false);
});

test("不设阈值——高分票不会被自动标记为选中", () => {
  // 设阈值自动选就等于自动挂载，绕回 V13 判断的原点。
  // 这条钉住的是「返回结构里没有 selected / autoPick 之类的字段」。
  const ranked = rankInvoices(TARGET, [invoice()]);
  const keys = Object.keys(ranked[0]!);
  assert.deepEqual(keys.sort(), ["dayGap", "invoice", "reasons", "score"]);
});
