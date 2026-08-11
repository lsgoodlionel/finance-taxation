import assert from "node:assert/strict";
import test from "node:test";
import {
  formatVoucherNumber,
  parseVoucherNumber,
  resolvePeriod,
  resolveVoucherWord
} from "./voucher-number.js";

test("voucher type maps to the Chinese voucher word by cash direction", () => {
  assert.equal(resolveVoucherWord("receipt"), "收");
  assert.equal(resolveVoucherWord("payment"), "付");
  // 其余一律记账凭证 —— 包括期末结转
  assert.equal(resolveVoucherWord("accrual"), "记");
  assert.equal(resolveVoucherWord("adjustment"), "记");
  assert.equal(resolveVoucherWord("general"), "记");
  assert.equal(resolveVoucherWord("closing"), "记");
});

test("the period comes from the accounting date, not the posting time", () => {
  // 凭证按月重新起编，而「月」必须取自会计日期 —— 6 月的业务 7 月过账仍属 6 月
  assert.equal(resolvePeriod("2026-06-17"), "2026-06");
  assert.equal(resolvePeriod("2026-01-01"), "2026-01");
  assert.equal(resolvePeriod("2026-12-31"), "2026-12");
});

test("voucher numbers are zero-padded and round-trip through parsing", () => {
  assert.equal(formatVoucherNumber("记", "2026-06", 37), "记-2026-06-0037");
  assert.equal(formatVoucherNumber("收", "2026-01", 1), "收-2026-01-0001");
  // 超过 4 位只是变长，不截断也不出错
  assert.equal(formatVoucherNumber("付", "2026-06", 12345), "付-2026-06-12345");

  for (const [word, period, seq] of [["记", "2026-06", 37], ["收", "2026-01", 1], ["付", "2026-06", 12345]] as const) {
    const parsed = parseVoucherNumber(formatVoucherNumber(word, period, seq));
    assert.deepEqual(parsed, { word, period, seq }, `${word}-${period}-${seq} 应能往返`);
  }
});

test("parsing refuses anything that is not a voucher number instead of guessing", () => {
  for (const bad of [
    "",
    "记-2026-06",            // 缺序号
    "记-202606-0037",        // 期间格式不对
    "X-2026-06-0037",        // 不是四个凭证字之一
    "记-2026-06-0000",       // 序号从 1 起，0 非法
    "记-2026-06-abc",
    "V-20260617-ABC123"      // 旧的 PDF 临时格式，不该被认成凭证号
  ]) {
    assert.equal(parseVoucherNumber(bad), null, `不应解析：${JSON.stringify(bad)}`);
  }
  // 前后空白容错（用户从别处粘贴）
  assert.deepEqual(parseVoucherNumber("  记-2026-06-0037  "), { word: "记", period: "2026-06", seq: 37 });
});
