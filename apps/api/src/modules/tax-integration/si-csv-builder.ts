/**
 * 社会保险费申报 CSV 生成器
 *
 * 格式依据：国家税务总局社会保险费申报缴纳（代征）系统
 * 2019年起社保费由税务机关统一征收，通过电子税务局申报
 * 住房公积金仍由住建部公积金管理中心管理，格式单独生成
 *
 * 险种：
 *   养老保险（pension）       ← 职工 + 单位
 *   医疗保险（medical）       ← 职工 + 单位 + 大病（可选）
 *   失业保险（unemployment）  ← 职工 + 单位
 *   工伤保险（work_injury）   ← 单位全额
 *   生育保险（maternity）     ← 单位全额（合并入医疗后为0）
 *
 * 住房公积金 CSV（公积金管理中心格式）
 */

import type { Employee, PayrollRecord, PayrollPolicy } from "@finance-taxation/domain-model";

function fmt(n: number): string { return n.toFixed(2); }

export interface SiDeclarationRow {
  seq: number;
  idCard: string;
  name: string;
  base: number;                 // 缴费基数
  // 个人承担
  pensionEmployee: number;
  medicalEmployee: number;
  unemploymentEmployee: number;
  // 单位承担
  pensionEmployer: number;
  medicalEmployer: number;
  unemploymentEmployer: number;
  workInjuryEmployer: number;   // 工伤（单位全额，约0.4%）
  maternityEmployer: number;    // 生育（单位全额，约0.8%，部分省已并入医疗）
  // 合计
  totalEmployee: number;
  totalEmployer: number;
  totalCombined: number;
}

export interface SiCsvOptions {
  companyName: string;
  creditCode: string;
  filingPeriod: string;
  insuredCity?: string;
}

export function buildSiDeclarationRows(
  employees: Employee[],
  records: PayrollRecord[],
  policy: PayrollPolicy,
  opts: SiCsvOptions,
): SiDeclarationRow[] {
  const employeeMap = new Map(employees.map((e) => [e.id, e]));

  return records
    .filter((r) => r.status === "confirmed")
    .map((record, idx) => {
      const emp = employeeMap.get(record.employeeId);
      // 缴费基数 = 实际工资，受上下限约束
      const rawBase = record.grossSalary;
      const base = Math.min(
        Math.max(rawBase, policy.socialSecurityBaseMin),
        policy.socialSecurityBaseMax,
      );

      // 个人部分
      const pensionEmployee      = base * policy.pensionEmployeeRate / 100;
      const medicalEmployee      = base * policy.medicalEmployeeRate / 100;
      const unemploymentEmployee = base * policy.unemploymentEmployeeRate / 100;

      // 单位部分
      const pensionEmployer      = base * policy.pensionEmployerRate / 100;
      const medicalEmployer      = base * policy.medicalEmployerRate / 100;
      const unemploymentEmployer = base * policy.unemploymentEmployerRate / 100;
      const workInjuryEmployer   = base * 0.004;    // 0.4% 工伤（行业默认，可配置）
      const maternityEmployer    = base * 0.008;    // 0.8% 生育

      const totalEmployee = pensionEmployee + medicalEmployee + unemploymentEmployee;
      const totalEmployer = pensionEmployer + medicalEmployer + unemploymentEmployer
        + workInjuryEmployer + maternityEmployer;

      return {
        seq: idx + 1,
        idCard: emp?.idCard ?? "",
        name: record.employeeName,
        base,
        pensionEmployee,
        medicalEmployee,
        unemploymentEmployee,
        pensionEmployer,
        medicalEmployer,
        unemploymentEmployer,
        workInjuryEmployer,
        maternityEmployer,
        totalEmployee,
        totalEmployer,
        totalCombined: totalEmployee + totalEmployer,
      } satisfies SiDeclarationRow;
    });
}

const SI_HEADER = [
  "序号", "证件号码", "姓名", "缴费基数",
  "养老(个人)", "医疗(个人)", "失业(个人)",
  "养老(单位)", "医疗(单位)", "失业(单位)", "工伤(单位)", "生育(单位)",
  "个人合计", "单位合计", "合计",
].join(",");

export function buildSiCsv(
  employees: Employee[],
  records: PayrollRecord[],
  policy: PayrollPolicy,
  opts: SiCsvOptions,
): string {
  const rows = buildSiDeclarationRows(employees, records, policy, opts);
  const totals = rows.reduce(
    (acc, r) => ({
      employee: acc.employee + r.totalEmployee,
      employer: acc.employer + r.totalEmployer,
      combined: acc.combined + r.totalCombined,
    }),
    { employee: 0, employer: 0, combined: 0 },
  );

  const lines = rows.map((r) => [
    r.seq, r.idCard, `"${r.name}"`, fmt(r.base),
    fmt(r.pensionEmployee), fmt(r.medicalEmployee), fmt(r.unemploymentEmployee),
    fmt(r.pensionEmployer), fmt(r.medicalEmployer), fmt(r.unemploymentEmployer),
    fmt(r.workInjuryEmployer), fmt(r.maternityEmployer),
    fmt(r.totalEmployee), fmt(r.totalEmployer), fmt(r.totalCombined),
  ].join(","));

  // 合计行
  const totalRow = [
    "", "", `"合计"`, "",
    "", "", "",
    "", "", "", "", "",
    fmt(totals.employee), fmt(totals.employer), fmt(totals.combined),
  ].join(",");

  const bom = "﻿";
  const meta = [
    `# 社会保险费月度申报表`,
    `# 缴费单位：${opts.companyName}`,
    `# 统一社会信用代码：${opts.creditCode}`,
    `# 申报所属期：${opts.filingPeriod}`,
    `# 参保城市：${opts.insuredCity ?? "未指定"}`,
    `# 生成时间：${new Date().toISOString().slice(0, 19).replace("T", " ")}`,
    `# 人员数：${rows.length}`,
    "",
  ].join("\n");

  return bom + meta + SI_HEADER + "\n" + lines.join("\n") + "\n" + totalRow + "\n";
}

// ── 住房公积金申报（住建部公积金管理中心格式）────────────────────────────────

const FUND_HEADER = [
  "序号", "证件号码", "姓名", "缴存基数",
  "个人缴存额", "单位缴存额", "合计缴存额",
].join(",");

export function buildHousingFundCsv(
  employees: Employee[],
  records: PayrollRecord[],
  policy: PayrollPolicy,
  opts: SiCsvOptions,
): string {
  const employeeMap = new Map(employees.map((e) => [e.id, e]));
  const rows = records
    .filter((r) => r.status === "confirmed")
    .map((r, idx) => {
      const emp = employeeMap.get(r.employeeId);
      const base = Math.min(
        Math.max(r.grossSalary, policy.socialSecurityBaseMin),
        policy.socialSecurityBaseMax,
      );
      const employee = base * policy.housingFundEmployeeRate / 100;
      const employer = base * policy.housingFundEmployerRate / 100;
      return [idx + 1, emp?.idCard ?? "", `"${r.employeeName}"`, fmt(base), fmt(employee), fmt(employer), fmt(employee + employer)].join(",");
    });

  const bom = "﻿";
  const meta = [
    `# 住房公积金汇缴明细表`,
    `# 单位名称：${opts.companyName}`,
    `# 所属期：${opts.filingPeriod}`,
    `# 生成时间：${new Date().toISOString().slice(0, 19).replace("T", " ")}`,
    "",
  ].join("\n");

  return bom + meta + FUND_HEADER + "\n" + rows.join("\n") + "\n";
}
