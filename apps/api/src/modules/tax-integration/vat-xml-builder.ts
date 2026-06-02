/**
 * 增值税纳税申报表 XML 生成器
 *
 * 格式依据：国家税务总局增值税纳税申报（一般纳税人适用）主表
 * 参考：《国家税务总局关于增值税发票管理若干事项的公告》（2019年第33号）
 *
 * 注意：各省电子税务局实际提交接口在此基础上有少量方言差异，
 * 本模块生成标准主表结构，使用者需根据所在省份系统要求调整命名空间。
 */

import type { VatWorkingPaper } from "@finance-taxation/domain-model";

export interface CompanyInfo {
  name: string;
  creditCode: string;   // 统一社会信用代码
  bankName?: string;
  bankAccount?: string;
}

function amt(value: string): string {
  return parseFloat(value || "0").toFixed(2);
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 将申报期间从 YYYY-MM 转为 "YYYY年MM月" 文字 + 下月15日截止日
 */
function formatPeriod(filingPeriod: string): { label: string; dueDate: string } {
  const [y, m] = filingPeriod.split("-");
  const year = y ?? "2026";
  const month = m ?? "01";
  const nextMonth = parseInt(month, 10) % 12 + 1;
  const nextYear = nextMonth === 1 ? String(parseInt(year, 10) + 1) : year;
  return {
    label: `${year}年${month}月`,
    dueDate: `${nextYear}-${String(nextMonth).padStart(2, "0")}-15`,
  };
}

/**
 * 生成标准增值税申报主表 XML
 * 适用于一般纳税人申报和小规模纳税人简易计税
 */
export function buildVatDeclarationXml(
  company: CompanyInfo,
  paper: VatWorkingPaper,
): string {
  const { label, dueDate } = formatPeriod(paper.filingPeriod);
  const isGeneral = paper.taxpayerType === "general_vat";

  const outputTax    = amt(paper.outputTaxAmount);
  const inputTax     = amt(paper.inputTaxAmount);
  const simplifiedTax = amt(paper.simplifiedTaxAmount);
  const payable      = amt(paper.payableVatAmount);

  const lineItems = paper.lines.map((line, i) => `
      <明细行 序号="${i + 1}">
        <项目名称>${esc(line.description)}</项目名称>
        <税率>${line.taxRate}%</税率>
        <销售额>${amt(line.taxableAmount)}</销售额>
        <税额>${amt(line.taxAmount)}</税额>
        <类型>${line.sourceType === "output" ? "销项" : line.sourceType === "input" ? "进项" : "调整"}</类型>
      </明细行>`).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!--
  增值税纳税申报表（主表）
  生成时间：${new Date().toISOString()}
  生成系统：Finance Taxation V3
  申报期间：${label}
  注意：本文件仅供上传至电子税务局使用，请勿手工修改
-->
<增值税纳税申报表 版本="2.0">
  <申报信息>
    <税款所属期>${label}</税款所属期>
    <申报截止日期>${dueDate}</申报截止日期>
    <填报日期>${new Date().toISOString().slice(0, 10)}</填报日期>
  </申报信息>

  <纳税人信息>
    <纳税人识别号>${esc(company.creditCode)}</纳税人识别号>
    <纳税人名称>${esc(company.name)}</纳税人名称>
    <纳税人类型>${isGeneral ? "一般纳税人" : "小规模纳税人"}</纳税人类型>
    ${company.bankName ? `<开户银行>${esc(company.bankName)}</开户银行>` : ""}
    ${company.bankAccount ? `<银行账号>${esc(company.bankAccount)}</银行账号>` : ""}
  </纳税人信息>

  <申报主表>
    ${isGeneral ? `
    <!-- 一般纳税人适用 -->
    <一般计税>
      <本期销项税额>${outputTax}</本期销项税额>
      <本期进项税额>${inputTax}</本期进项税额>
      <进项税额转出>0.00</进项税额转出>
      <免抵退税额>0.00</免抵退税额>
      <期末留抵税额>${parseFloat(payable) < 0 ? Math.abs(parseFloat(payable)).toFixed(2) : "0.00"}</期末留抵税额>
      <应纳税额>${parseFloat(payable) > 0 ? payable : "0.00"}</应纳税额>
    </一般计税>` : `
    <!-- 小规模纳税人适用 -->
    <简易计税>
      <销售额>${amt(paper.lines[0]?.taxableAmount ?? "0")}</销售额>
      <征收率>3%</征收率>
      <应纳税额>${simplifiedTax}</应纳税额>
    </简易计税>`}

    <合计>
      <本期应补（退）税额>${payable}</本期应补（退）税额>
    </合计>
  </申报主表>

  <明细数据>
    <税额明细>${lineItems}
    </税额明细>
  </明细数据>
</增值税纳税申报表>
`.trim();
}
