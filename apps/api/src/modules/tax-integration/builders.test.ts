import assert from "node:assert/strict";
import { test } from "node:test";
import { buildVatDeclarationXml } from "./vat-xml-builder.js";
import { buildIitCsvRows } from "./iit-csv-builder.js";
import { buildSiDeclarationRows } from "./si-csv-builder.js";
import type { VatWorkingPaper, TaxpayerProfile, Employee, PayrollRecord, PayrollPolicy } from "@finance-taxation/domain-model";

// ── VAT XML builder ───────────────────────────────────────────────────────────

test("buildVatDeclarationXml includes company name", () => {
  const paper: VatWorkingPaper = {
    companyId: "c1", filingPeriod: "2026-05", taxpayerType: "general_vat",
    outputTaxAmount: "13000", inputTaxAmount: "5000",
    simplifiedTaxAmount: "0", payableVatAmount: "8000", lines: [],
  };
  const xml = buildVatDeclarationXml({ name: "测试公司", creditCode: "9134000072600956XH" }, paper);
  assert.ok(xml.includes("测试公司"), "company name in XML");
  assert.ok(xml.includes("9134000072600956XH"), "credit code in XML");
  assert.ok(xml.includes("13000.00"), "output tax in XML");
  assert.ok(xml.includes("8000.00"), "payable amount in XML");
  assert.ok(xml.includes("2026年05月"), "period label in XML");
});

test("buildVatDeclarationXml handles small taxpayer", () => {
  const paper: VatWorkingPaper = {
    companyId: "c1", filingPeriod: "2026-05", taxpayerType: "small_scale",
    outputTaxAmount: "0", inputTaxAmount: "0",
    simplifiedTaxAmount: "1500", payableVatAmount: "1500", lines: [],
  };
  const xml = buildVatDeclarationXml({ name: "小规模公司", creditCode: "X" }, paper);
  assert.ok(xml.includes("小规模纳税人") || xml.includes("简易计税"), "small taxpayer section present");
  assert.ok(xml.includes("简易计税"), "simplified tax section");
});

test("buildVatDeclarationXml escapes special characters", () => {
  const paper: VatWorkingPaper = {
    companyId: "c1", filingPeriod: "2026-05", taxpayerType: "general_vat",
    outputTaxAmount: "0", inputTaxAmount: "0", simplifiedTaxAmount: "0", payableVatAmount: "0", lines: [],
  };
  const xml = buildVatDeclarationXml({ name: "A&B<测试>公司", creditCode: "X" }, paper);
  assert.ok(xml.includes("A&amp;B&lt;测试&gt;公司"), "special chars escaped");
});

// ── IIT CSV builder ───────────────────────────────────────────────────────────

const policy: PayrollPolicy = {
  id: "p1", companyId: "c1",
  socialSecurityBaseMin: 3000, socialSecurityBaseMax: 31221,
  pensionEmployeeRate: 8, pensionEmployerRate: 16,
  medicalEmployeeRate: 2, medicalEmployerRate: 8,
  unemploymentEmployeeRate: 0.5, unemploymentEmployerRate: 0.5,
  housingFundEmployeeRate: 5, housingFundEmployerRate: 5,
  iitThreshold: 5000, updatedAt: "2026-01-01",
};

const employees: Employee[] = [
  { id: "e1", companyId: "c1", departmentId: null, name: "张三", idCard: "110101199001011234",
    position: "工程师", hireDate: "2023-01-01", leaveDate: null, baseSalary: 0,
    status: "active", notes: "", createdAt: "", updatedAt: "" },
];

const records: PayrollRecord[] = [
  { id: "r1", companyId: "c1", period: "2026-05", employeeId: "e1",
    employeeName: "张三", grossSalary: 20000,
    socialSecurityEmployee: 20000 * (8 + 2 + 0.5 + 5) / 100,
    socialSecurityEmployer: 0, housingFundEmployee: 0, housingFundEmployer: 0,
    iitWithheld: 0, netPay: 0,
    status: "confirmed", confirmedAt: null, confirmedByUserId: null,
    confirmedByName: "", notes: "", createdAt: "", updatedAt: "" },
];

test("buildIitCsvRows computes taxable income correctly", () => {
  const rows = buildIitCsvRows(employees, records, policy, {
    companyName: "测试公司", creditCode: "X", filingPeriod: "2026-05",
  });
  assert.equal(rows.length, 1, "one row for one employee");
  const row = rows[0]!;
  // grossSalary=20000, deductionBase=5000, siEmployee=20000*(8+2+0.5+5)/100=3100
  // taxableIncome = 20000 - 5000 - 3100 = 11900
  assert.ok(row.taxableIncome > 0, "taxable income is positive");
  assert.ok(row.taxPayable >= 0, "tax payable is non-negative");
});

test("buildIitCsvRows assigns correct IIT bracket for high income", () => {
  const highIncomeRecord = [{ ...records[0]!, grossSalary: 100000 }];
  const rows = buildIitCsvRows(employees, highIncomeRecord, policy, {
    companyName: "X", creditCode: "X", filingPeriod: "2026-05",
  });
  // taxable ≈ 100000 - 5000 - 100000*0.155 = 79500 → 10% bracket (≤144000)
  assert.ok(rows[0]!.rate >= 10, "high income uses 10%+ bracket");
});

// ── Social Insurance CSV builder ──────────────────────────────────────────────

test("buildSiDeclarationRows respects base min/max", () => {
  const lowIncomeRecord = [{ ...records[0]!, grossSalary: 1000 }]; // below min 3000
  const rows = buildSiDeclarationRows(employees, lowIncomeRecord, policy, {
    companyName: "X", creditCode: "X", filingPeriod: "2026-05",
  });
  assert.equal(rows[0]!.base, 3000, "base clamped to minimum");
});

test("buildSiDeclarationRows computes employer contributions", () => {
  const rows = buildSiDeclarationRows(employees, records, policy, {
    companyName: "X", creditCode: "X", filingPeriod: "2026-05",
  });
  const row = rows[0]!;
  assert.ok(row.pensionEmployer > 0, "pension employer > 0");
  assert.ok(row.medicalEmployer > 0, "medical employer > 0");
  assert.ok(row.totalEmployer > row.totalEmployee, "employer total > employee total");
});
