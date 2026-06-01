/**
 * 个人所得税扣缴申报 CSV 生成器
 *
 * 格式依据：国家税务总局《个人所得税扣缴申报管理办法（试行）》
 * 自然人电子税务局"工资薪金所得"扣缴申报导入格式
 *
 * 列顺序（12列）：
 *   1  序号
 *   2  证件类型（居民身份证=1）
 *   3  证件号码
 *   4  纳税人姓名
 *   5  累计收入额（本期工资薪金总额）
 *   6  累计减除费用（5000/月 × 期数）
 *   7  累计专项扣除（三险一金个人承担部分）
 *   8  累计专项附加扣除（默认0，员工自行申报）
 *   9  累计其他扣除（默认0）
 *   10 累计应纳税所得额（5-6-7-8-9）
 *   11 代扣税率（%）
 *   12 速算扣除数
 *   13 应扣缴税额
 *   14 减免税额（默认0）
 *   15 实际扣缴税额
 */

import type { Employee, PayrollRecord, PayrollPolicy } from "@finance-taxation/domain-model";

const IIT_BRACKETS = [
  { max: 36000,    rate: 0.03, quick: 0      },
  { max: 144000,   rate: 0.10, quick: 2520   },
  { max: 300000,   rate: 0.20, quick: 16920  },
  { max: 420000,   rate: 0.25, quick: 31920  },
  { max: 660000,   rate: 0.30, quick: 52920  },
  { max: 960000,   rate: 0.35, quick: 85920  },
  { max: Infinity, rate: 0.45, quick: 181920 },
];

function getIitBracket(taxableIncome: number) {
  return IIT_BRACKETS.find((b) => taxableIncome <= b.max) ?? IIT_BRACKETS[IIT_BRACKETS.length - 1]!;
}

function fmt(n: number): string {
  return n.toFixed(2);
}

export interface IitCsvRow {
  seq: number;
  idCard: string;
  name: string;
  grossIncome: number;
  deductionBase: number;        // 5000 × months
  socialSecurityEmployee: number;
  housingFundEmployee: number;
  taxableIncome: number;
  rate: number;
  quickDeduction: number;
  taxPayable: number;
  taxReduction: number;
  taxActual: number;
}

export interface IitCsvOptions {
  companyName: string;
  creditCode: string;
  filingPeriod: string;           // YYYY-MM
  monthsInPeriod?: number;        // 默认1个月
}

export function buildIitCsvRows(
  employees: Employee[],
  records: PayrollRecord[],
  policy: PayrollPolicy,
  opts: IitCsvOptions,
): IitCsvRow[] {
  const months = opts.monthsInPeriod ?? 1;
  const deductionBase = 5000 * months;

  const employeeMap = new Map(employees.map((e) => [e.id, e]));

  return records
    .filter((r) => r.status === "confirmed")
    .map((record, idx) => {
      const emp = employeeMap.get(record.employeeId);
      const siEmployee = record.socialSecurityEmployee + record.housingFundEmployee;
      const taxableIncome = Math.max(
        0,
        record.grossSalary * months - deductionBase - siEmployee,
      );
      const bracket = getIitBracket(taxableIncome);
      const taxPayable = taxableIncome * bracket.rate - bracket.quick;

      return {
        seq: idx + 1,
        idCard: emp?.idCard ?? "",
        name: record.employeeName,
        grossIncome: record.grossSalary * months,
        deductionBase,
        socialSecurityEmployee: siEmployee,
        housingFundEmployee: 0,                   // 已计入 siEmployee
        taxableIncome,
        rate: bracket.rate * 100,
        quickDeduction: bracket.quick,
        taxPayable: Math.max(0, taxPayable),
        taxReduction: 0,
        taxActual: Math.max(0, taxPayable),
      } satisfies IitCsvRow;
    });
}

const CSV_HEADER = [
  "序号", "证件类型", "证件号码", "纳税人姓名",
  "累计收入额", "累计减除费用", "累计专项扣除", "累计专项附加扣除", "累计其他扣除",
  "累计应纳税所得额", "税率(%)", "速算扣除数", "应扣缴税额", "减免税额", "实际扣缴税额",
].join(",");

export function buildIitCsv(
  employees: Employee[],
  records: PayrollRecord[],
  policy: PayrollPolicy,
  opts: IitCsvOptions,
): string {
  const rows = buildIitCsvRows(employees, records, policy, opts);
  const lines = rows.map((r) => [
    r.seq,
    1,              // 居民身份证
    r.idCard,
    `"${r.name}"`,
    fmt(r.grossIncome),
    fmt(r.deductionBase),
    fmt(r.socialSecurityEmployee),
    "0.00",         // 专项附加扣除（员工自报）
    "0.00",
    fmt(r.taxableIncome),
    fmt(r.rate),
    fmt(r.quickDeduction),
    fmt(r.taxPayable),
    fmt(r.taxReduction),
    fmt(r.taxActual),
  ].join(","));

  // BOM for Excel compatibility on Windows
  const bom = "﻿";
  const meta = [
    `# 个人所得税扣缴申报表`,
    `# 扣缴义务人：${opts.companyName}`,
    `# 扣缴义务人识别号：${opts.creditCode}`,
    `# 所属期：${opts.filingPeriod}`,
    `# 生成时间：${new Date().toISOString().slice(0, 19).replace("T", " ")}`,
    `# 共 ${rows.length} 条记录`,
    "",
  ].join("\n");

  return bom + meta + CSV_HEADER + "\n" + lines.join("\n") + "\n";
}
