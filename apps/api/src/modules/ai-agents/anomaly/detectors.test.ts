import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectDuplicatePayments,
  detectInvoiceGaps,
  detectWeekendLargeAmounts,
  detectTaxBurdenSwing,
  runAnomalyScan
} from "./detectors.js";

// ── detectDuplicatePayments ──────────────────────────────────────────────────

test("重复付款：同收款方同金额且日期相近，判定为疑似重复付款", () => {
  const findings = detectDuplicatePayments([
    { id: "p1", payeeName: "上海某某供应商", amountCents: 1_000_00, entryDate: "2024-03-01" },
    { id: "p2", payeeName: "上海某某供应商", amountCents: 1_000_00, entryDate: "2024-03-02" }
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.kind, "DUPLICATE_PAYMENT");
  assert.equal(findings[0]!.severity, "alert");
  assert.deepEqual(findings[0]!.refs, ["p1", "p2"]);
});

test("重复付款：三笔相邻日期聚为一簇（滑动窗口链式聚合）", () => {
  const findings = detectDuplicatePayments([
    { id: "p1", payeeName: "供应商A", amountCents: 500_00, entryDate: "2024-03-01" },
    { id: "p2", payeeName: "供应商A", amountCents: 500_00, entryDate: "2024-03-03" },
    { id: "p3", payeeName: "供应商A", amountCents: 500_00, entryDate: "2024-03-05" }
  ]);
  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0]!.refs, ["p1", "p2", "p3"]);
});

test("重复付款：收款方不同则不判定为重复", () => {
  const findings = detectDuplicatePayments([
    { id: "p1", payeeName: "供应商A", amountCents: 1_000_00, entryDate: "2024-03-01" },
    { id: "p2", payeeName: "供应商B", amountCents: 1_000_00, entryDate: "2024-03-01" }
  ]);
  assert.equal(findings.length, 0);
});

test("重复付款：金额不同则不判定为重复", () => {
  const findings = detectDuplicatePayments([
    { id: "p1", payeeName: "供应商A", amountCents: 1_000_00, entryDate: "2024-03-01" },
    { id: "p2", payeeName: "供应商A", amountCents: 900_00, entryDate: "2024-03-01" }
  ]);
  assert.equal(findings.length, 0);
});

test("重复付款：日期间隔超过窗口则不聚合", () => {
  const findings = detectDuplicatePayments(
    [
      { id: "p1", payeeName: "供应商A", amountCents: 1_000_00, entryDate: "2024-03-01" },
      { id: "p2", payeeName: "供应商A", amountCents: 1_000_00, entryDate: "2024-03-10" }
    ],
    3
  );
  assert.equal(findings.length, 0);
});

test("重复付款：空数组与单条记录均不产生预警", () => {
  assert.deepEqual(detectDuplicatePayments([]), []);
  assert.deepEqual(
    detectDuplicatePayments([{ id: "p1", payeeName: "供应商A", amountCents: 100, entryDate: "2024-03-01" }]),
    []
  );
});

// ── detectInvoiceGaps ────────────────────────────────────────────────────────

test("发票断号：同前缀号段中间缺失一张，判定为断号", () => {
  const findings = detectInvoiceGaps([
    { id: "i1", invoiceNo: "0001" },
    { id: "i2", invoiceNo: "0002" },
    { id: "i3", invoiceNo: "0004" }
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.kind, "INVOICE_NUMBER_GAP");
  assert.match(findings[0]!.detail, /0003/);
  assert.deepEqual(findings[0]!.refs, ["i2", "i3"]);
});

test("发票断号：缺失多张时给出区间标签", () => {
  const findings = detectInvoiceGaps([
    { id: "i1", invoiceNo: "0001" },
    { id: "i2", invoiceNo: "0005" }
  ]);
  assert.equal(findings.length, 1);
  assert.match(findings[0]!.detail, /0002 ~ 0004/);
});

test("发票断号：连续号段不产生预警", () => {
  const findings = detectInvoiceGaps([
    { id: "i1", invoiceNo: "0001" },
    { id: "i2", invoiceNo: "0002" },
    { id: "i3", invoiceNo: "0003" }
  ]);
  assert.equal(findings.length, 0);
});

test("发票断号：不同发票代码不参与同一号段比较", () => {
  const findings = detectInvoiceGaps([
    { id: "i1", invoiceNo: "0001", invoiceCode: "AAA" },
    { id: "i2", invoiceNo: "0005", invoiceCode: "BBB" }
  ]);
  assert.equal(findings.length, 0);
});

test("发票断号：无法解析末尾数字的发票号被安全跳过", () => {
  const findings = detectInvoiceGaps([
    { id: "i1", invoiceNo: "NO-DIGITS-HERE-XYZ" },
    { id: "i2", invoiceNo: "ALSO-NONE" }
  ]);
  assert.deepEqual(findings, []);
});

test("发票断号：空数组不产生预警", () => {
  assert.deepEqual(detectInvoiceGaps([]), []);
});

// ── detectWeekendLargeAmounts ────────────────────────────────────────────────

test("周末大额：周六发生且达到阈值，判定为 warning", () => {
  // 2024-01-06 为周六
  const findings = detectWeekendLargeAmounts(
    [{ id: "e1", entryDate: "2024-01-06", amountCents: 100_000_00 }],
    50_000_00
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.kind, "WEEKEND_LARGE_AMOUNT");
  assert.equal(findings[0]!.severity, "warning");
});

test("周末大额：达到 3 倍阈值升级为 alert", () => {
  // 2024-01-07 为周日
  const findings = detectWeekendLargeAmounts(
    [{ id: "e1", entryDate: "2024-01-07", amountCents: 200_000_00 }],
    50_000_00
  );
  assert.equal(findings[0]!.severity, "alert");
});

test("周末大额：工作日发生的大额交易不预警", () => {
  // 2024-01-08 为周一
  const findings = detectWeekendLargeAmounts(
    [{ id: "e1", entryDate: "2024-01-08", amountCents: 100_000_00 }],
    50_000_00
  );
  assert.equal(findings.length, 0);
});

test("周末大额：周末但未达阈值不预警", () => {
  const findings = detectWeekendLargeAmounts(
    [{ id: "e1", entryDate: "2024-01-06", amountCents: 10_000_00 }],
    50_000_00
  );
  assert.equal(findings.length, 0);
});

test("周末大额：非法日期字符串被安全跳过而不抛错", () => {
  const findings = detectWeekendLargeAmounts(
    [{ id: "e1", entryDate: "not-a-date", amountCents: 100_000_00 }],
    50_000_00
  );
  assert.deepEqual(findings, []);
});

test("周末大额：空数组不产生预警", () => {
  assert.deepEqual(detectWeekendLargeAmounts([], 50_000_00), []);
});

// ── detectTaxBurdenSwing ─────────────────────────────────────────────────────

test("税负率突变：环比变动超过阈值判定为 warning", () => {
  const findings = detectTaxBurdenSwing([
    { period: "2024-01", taxAmountCents: 10_000_00, revenueCents: 1_000_000_00 }, // 1%
    { period: "2024-02", taxAmountCents: 50_000_00, revenueCents: 1_000_000_00 } // 5%
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]!.kind, "TAX_BURDEN_SWING");
  assert.equal(findings[0]!.severity, "warning");
  assert.deepEqual(findings[0]!.refs, ["2024-01", "2024-02"]);
});

test("税负率突变：变动达到 2 倍阈值升级为 alert", () => {
  const findings = detectTaxBurdenSwing([
    { period: "2024-01", taxAmountCents: 10_000_00, revenueCents: 1_000_000_00 }, // 1%
    { period: "2024-02", taxAmountCents: 80_000_00, revenueCents: 1_000_000_00 } // 8%
  ]);
  assert.equal(findings[0]!.severity, "alert");
});

test("税负率突变：变动在阈值内不产生预警", () => {
  const findings = detectTaxBurdenSwing([
    { period: "2024-01", taxAmountCents: 10_000_00, revenueCents: 1_000_000_00 }, // 1%
    { period: "2024-02", taxAmountCents: 11_000_00, revenueCents: 1_000_000_00 } // 1.1%
  ]);
  assert.equal(findings.length, 0);
});

test("税负率突变：任一账期收入为 0 时除零安全并跳过比较", () => {
  const findings = detectTaxBurdenSwing([
    { period: "2024-01", taxAmountCents: 0, revenueCents: 0 },
    { period: "2024-02", taxAmountCents: 50_000_00, revenueCents: 1_000_000_00 }
  ]);
  assert.deepEqual(findings, []);
});

test("税负率突变：输入乱序时按账期标签排序后再比较", () => {
  const findings = detectTaxBurdenSwing([
    { period: "2024-02", taxAmountCents: 50_000_00, revenueCents: 1_000_000_00 },
    { period: "2024-01", taxAmountCents: 10_000_00, revenueCents: 1_000_000_00 }
  ]);
  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0]!.refs, ["2024-01", "2024-02"]);
});

test("税负率突变：空数组与单账期均不产生预警", () => {
  assert.deepEqual(detectTaxBurdenSwing([]), []);
  assert.deepEqual(
    detectTaxBurdenSwing([{ period: "2024-01", taxAmountCents: 10_000_00, revenueCents: 1_000_000_00 }]),
    []
  );
});

// ── runAnomalyScan ───────────────────────────────────────────────────────────

test("聚合扫描：汇总所有子检测器的产出", () => {
  const findings = runAnomalyScan({
    payments: [
      { id: "p1", payeeName: "供应商A", amountCents: 1_000_00, entryDate: "2024-03-01" },
      { id: "p2", payeeName: "供应商A", amountCents: 1_000_00, entryDate: "2024-03-02" }
    ],
    invoices: [
      { id: "i1", invoiceNo: "0001" },
      { id: "i2", invoiceNo: "0003" }
    ],
    weekendEntries: [{ id: "e1", entryDate: "2024-01-06", amountCents: 100_000_00 }],
    weekendThresholdCents: 50_000_00,
    taxBurdenPeriods: [
      { period: "2024-01", taxAmountCents: 10_000_00, revenueCents: 1_000_000_00 },
      { period: "2024-02", taxAmountCents: 50_000_00, revenueCents: 1_000_000_00 }
    ]
  });

  const kinds = findings.map((f) => f.kind).sort();
  assert.deepEqual(kinds, [
    "DUPLICATE_PAYMENT",
    "INVOICE_NUMBER_GAP",
    "TAX_BURDEN_SWING",
    "WEEKEND_LARGE_AMOUNT"
  ]);
});

test("聚合扫描：空输入不产生任何预警", () => {
  assert.deepEqual(runAnomalyScan({}), []);
});
