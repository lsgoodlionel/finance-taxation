/**
 * 银行流水 CSV 解析器
 *
 * 支持格式：
 *   - 招商银行（CMB）企业网银流水
 *   - 工商银行（ICBC）对账单
 *   - 建设银行（CCB）网银明细
 *   - 通用格式（日期,摘要,借方,贷方,余额）
 *
 * 解析规则：自动识别列头，容错乱序列名
 */

export interface ParsedStatement {
  transactionDate: string;    // YYYY-MM-DD
  valueDate: string | null;
  amount: number;             // 正=收款 负=付款
  balance: number | null;
  counterpartyName: string | null;
  counterpartyNo: string | null;
  transactionRef: string | null;
  description: string | null;
  raw: Record<string, string>;
}

export interface ParseResult {
  rows: ParsedStatement[];
  detectedFormat: string;
  errorRows: number;
  totalRows: number;
}

// ── 格式指纹（列头关键词） ────────────────────────────────────────────────────

const FORMAT_SIGNATURES: Record<string, string[]> = {
  cmb:     ["交易日期", "交易金额", "账户余额", "摘要", "对方账号", "对方户名"],
  icbc:    ["记账日期", "借方发生额", "贷方发生额", "余额", "交易摘要"],
  ccb:     ["交易时间", "交易金额", "账户余额", "交易摘要", "对手账号"],
  generic: ["日期", "金额", "余额"],
};

function detectFormat(headers: string[]): string {
  const headerSet = new Set(headers.map((h) => h.trim()));
  for (const [fmt, keys] of Object.entries(FORMAT_SIGNATURES)) {
    const matched = keys.filter((k) => headerSet.has(k)).length;
    if (matched >= 2) return fmt;
  }
  return "unknown";
}

// ── 解析日期 ──────────────────────────────────────────────────────────────────

function parseDate(raw: string): string | null {
  if (!raw) return null;
  // YYYY-MM-DD, YYYY/MM/DD, YYYYMMDD, DD/MM/YYYY
  const clean = raw.trim().replace(/[年月]/g, "-").replace(/[日]/g, "");
  const m = clean.match(/(\d{4})[-/]?(\d{2})[-/]?(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

// ── 解析金额 ──────────────────────────────────────────────────────────────────

function parseAmount(raw: string): number | null {
  if (!raw || raw.trim() === "" || raw.trim() === "-") return null;
  const cleaned = raw.replace(/[,，\s]/g, "").replace(/[￥¥]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

// ── 按格式提取字段 ────────────────────────────────────────────────────────────

function extractRow(row: Record<string, string>, format: string): Omit<ParsedStatement, "raw"> | null {
  if (format === "cmb") {
    const date = parseDate(row["交易日期"] ?? "");
    const amount = parseAmount(row["交易金额"] ?? "");
    if (!date || amount === null) return null;
    return {
      transactionDate: date,
      valueDate: parseDate(row["记账日期"] ?? "") ?? null,
      amount,
      balance: parseAmount(row["账户余额"] ?? "") ?? null,
      counterpartyName: row["对方户名"]?.trim() ?? null,
      counterpartyNo:   row["对方账号"]?.trim() ?? null,
      transactionRef:   row["交易流水号"]?.trim() ?? null,
      description:      row["摘要"]?.trim() ?? null,
    };
  }

  if (format === "icbc") {
    const date = parseDate(row["记账日期"] ?? "");
    if (!date) return null;
    const debit  = parseAmount(row["借方发生额"] ?? "") ?? 0;
    const credit = parseAmount(row["贷方发生额"] ?? "") ?? 0;
    const amount = credit > 0 ? credit : -debit;
    if (amount === 0 && debit === 0 && credit === 0) return null;
    return {
      transactionDate: date,
      valueDate: null,
      amount,
      balance: parseAmount(row["余额"] ?? "") ?? null,
      counterpartyName: row["对方名称"]?.trim() ?? null,
      counterpartyNo:   row["对方账号"]?.trim() ?? null,
      transactionRef:   row["交易参考号"]?.trim() ?? row["流水号"]?.trim() ?? null,
      description:      row["交易摘要"]?.trim() ?? null,
    };
  }

  if (format === "ccb") {
    const date = parseDate((row["交易时间"] ?? "").split(" ")[0] ?? "");
    const amount = parseAmount(row["交易金额"] ?? "");
    if (!date || amount === null) return null;
    return {
      transactionDate: date,
      valueDate: null,
      amount,
      balance: parseAmount(row["账户余额"] ?? "") ?? null,
      counterpartyName: row["对手户名"]?.trim() ?? null,
      counterpartyNo:   row["对手账号"]?.trim() ?? null,
      transactionRef:   row["交易流水号"]?.trim() ?? null,
      description:      row["交易摘要"]?.trim() ?? null,
    };
  }

  // generic: 日期, 摘要, 借方, 贷方, 余额
  const date = parseDate(row["日期"] ?? row["交易日期"] ?? "");
  if (!date) return null;
  const debit  = parseAmount(row["借方"] ?? row["支出"] ?? "") ?? 0;
  const credit = parseAmount(row["贷方"] ?? row["收入"] ?? "") ?? 0;
  const direct = parseAmount(row["金额"] ?? "");
  const amount = direct !== null ? direct : (credit > 0 ? credit : -debit);
  return {
    transactionDate: date,
    valueDate: null,
    amount,
    balance: parseAmount(row["余额"] ?? row["账户余额"] ?? "") ?? null,
    counterpartyName: row["对方户名"]?.trim() ?? null,
    counterpartyNo:   row["对方账号"]?.trim() ?? null,
    transactionRef:   row["流水号"]?.trim() ?? null,
    description:      (row["摘要"] ?? row["备注"] ?? row["说明"] ?? "").trim() || null,
  };
}

// ── 主解析函数 ────────────────────────────────────────────────────────────────

export function parseBankStatementCsv(csvText: string): ParseResult {
  // 去 BOM
  const text = csvText.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const allLines = text.split("\n").filter((l) => l.trim() !== "");

  // 跳过以 # 开头的注释行，找到列头行
  const dataLines = allLines.filter((l) => !l.startsWith("#"));
  if (dataLines.length < 2) return { rows: [], detectedFormat: "unknown", errorRows: 0, totalRows: 0 };

  const headerLine = dataLines[0]!;
  const headers = headerLine.split(",").map((h) => h.replace(/^"|"$/g, "").trim());
  const format = detectFormat(headers);

  const rows: ParsedStatement[] = [];
  let errorRows = 0;

  for (let i = 1; i < dataLines.length; i++) {
    const line = dataLines[i]!.trim();
    if (!line) continue;

    // 简单 CSV 分割（银行流水无多行字段，split 足够）
    const cells = line.split(",").map((c) => c.replace(/^"|"$/g, "").replace(/""/g, '"').trim());

    const rowMap: Record<string, string> = {};
    headers.forEach((h, idx) => { rowMap[h] = cells[idx] ?? ""; });

    const extracted = extractRow(rowMap, format);
    if (!extracted) { errorRows++; continue; }

    // 生成 transactionRef 如果没有
    const ref = extracted.transactionRef
      ?? `${extracted.transactionDate}-${i}-${Math.abs(extracted.amount).toFixed(2)}`;

    rows.push({ ...extracted, transactionRef: ref, raw: rowMap });
  }

  return { rows, detectedFormat: format, errorRows, totalRows: dataLines.length - 1 };
}
