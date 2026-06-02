import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTransferFile, type TransferLine } from "./transfer-file.js";

const LINES: TransferLine[] = [
  { employeeName: "张三", salaryAccount: "6222021234567890", salaryBank: "招商银行", amount: 8500.5 },
  { employeeName: "李四,A", salaryAccount: "6222029876543210", salaryBank: "工商银行", amount: 6200 },
];

test("buildTransferFile generic CSV 含表头与逐行金额", () => {
  const result = buildTransferFile(LINES, "2026-05", "generic");
  assert.equal(result.fileName, "工资代发_2026-05.csv");
  assert.equal(result.lineCount, 2);
  assert.equal(result.totalAmount, 14700.5);

  const rows = result.content.split("\r\n");
  assert.equal(rows[0], "序号,户名,账号,开户行,金额,备注");
  assert.ok(rows[1]?.startsWith("1,张三,6222021234567890,招商银行,8500.50,"));
  assert.ok(rows[1]?.endsWith("2026-05工资"));
});

test("buildTransferFile CMB 格式列序为收款账号/户名/金额/用途", () => {
  const result = buildTransferFile(LINES, "2026-05", "cmb");
  assert.equal(result.fileName, "招行代发_2026-05.csv");
  const rows = result.content.split("\r\n");
  assert.equal(rows[0], "收款账号,收款户名,金额,用途");
  assert.ok(rows[1]?.startsWith("6222021234567890,张三,8500.50,"));
});

test("buildTransferFile 转义含逗号的字段", () => {
  const result = buildTransferFile(LINES, "2026-05", "generic");
  // 李四,A 含逗号，应被双引号包裹
  assert.ok(result.content.includes('"李四,A"'));
});

test("buildTransferFile 金额合计保留两位小数精度", () => {
  const lines: TransferLine[] = [
    { employeeName: "A", salaryAccount: "1", salaryBank: "x", amount: 0.1 },
    { employeeName: "B", salaryAccount: "2", salaryBank: "x", amount: 0.2 },
  ];
  const result = buildTransferFile(lines, "2026-05", "generic");
  assert.equal(result.totalAmount, 0.3);
});

test("buildTransferFile 空明细只输出表头", () => {
  const result = buildTransferFile([], "2026-05", "generic");
  assert.equal(result.lineCount, 0);
  assert.equal(result.totalAmount, 0);
  assert.equal(result.content, "序号,户名,账号,开户行,金额,备注");
});
