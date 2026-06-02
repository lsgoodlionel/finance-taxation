/**
 * P3 工资代发文件生成
 *
 * 支持两种格式：
 *   generic  通用 CSV（户名/账号/开户行/金额/备注），多数企业网银可导入
 *   cmb      招商银行企业银行批量代发模板（收款账号/户名/金额/用途）
 *
 * 纯函数，便于单测；不触碰数据库。
 */

export interface TransferLine {
  employeeName: string;
  salaryAccount: string;
  salaryBank: string;
  amount: number;
}

export type TransferFileFormat = "generic" | "cmb";

export interface TransferFileResult {
  fileName: string;
  content: string;
  lineCount: number;
  totalAmount: number;
}

/** CSV 单元格转义：含逗号/引号/换行时用双引号包裹并转义内部引号。 */
function csvCell(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(cells: (string | number)[]): string {
  return cells.map(csvCell).join(",");
}

function sumAmount(lines: TransferLine[]): number {
  return Number(lines.reduce((sum, l) => sum + l.amount, 0).toFixed(2));
}

// ── 通用 CSV ────────────────────────────────────────────────────────────────

function buildGenericCsv(lines: TransferLine[], period: string): string {
  const header = csvRow(["序号", "户名", "账号", "开户行", "金额", "备注"]);
  const body = lines.map((l, i) =>
    csvRow([i + 1, l.employeeName, l.salaryAccount, l.salaryBank, l.amount.toFixed(2), `${period}工资`]),
  );
  return [header, ...body].join("\r\n");
}

// ── 招商银行企业银行批量代发模板 ──────────────────────────────────────────────
// 招行企业网银「代发业务」批量导入：收款账号 / 收款户名 / 金额 / 用途

function buildCmbCsv(lines: TransferLine[], period: string): string {
  const header = csvRow(["收款账号", "收款户名", "金额", "用途"]);
  const body = lines.map((l) =>
    csvRow([l.salaryAccount, l.employeeName, l.amount.toFixed(2), `${period}工资代发`]),
  );
  return [header, ...body].join("\r\n");
}

// ── 统一入口 ──────────────────────────────────────────────────────────────────

export function buildTransferFile(
  lines: TransferLine[],
  period: string,
  format: TransferFileFormat,
): TransferFileResult {
  const content = format === "cmb"
    ? buildCmbCsv(lines, period)
    : buildGenericCsv(lines, period);

  const fileName = format === "cmb"
    ? `招行代发_${period}.csv`
    : `工资代发_${period}.csv`;

  return {
    fileName,
    content,
    lineCount: lines.length,
    totalAmount: sumAmount(lines),
  };
}
