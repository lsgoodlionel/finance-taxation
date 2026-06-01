/**
 * 申报文件导出 API
 * GET  /api/tax-integration/vat-xml?period=YYYY-MM
 * GET  /api/tax-integration/iit-csv?period=YYYY-MM
 * GET  /api/tax-integration/si-csv?period=YYYY-MM
 * GET  /api/tax-integration/fund-csv?period=YYYY-MM
 * GET  /api/tax-integration/submissions[?period=]
 * PATCH /api/tax-integration/submissions/:id/confirm
 */

import type { ServerResponse } from "node:http";
import type { TaxpayerProfile, TaxItem, Employee, PayrollRecord, PayrollPolicy } from "@finance-taxation/domain-model";
import { query, queryOne } from "../../db/client.js";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { writeAudit } from "../../services/audit.js";
import { resolveActiveTaxpayerProfile } from "../tax/profile.js";
import { buildVatWorkingPaper } from "../tax/vat-working-paper.js";
import { buildVatDeclarationXml } from "./vat-xml-builder.js";
import { buildIitCsv } from "./iit-csv-builder.js";
import { buildSiCsv, buildHousingFundCsv } from "./si-csv-builder.js";

// ── response helpers ──────────────────────────────────────────────────────────

function csvResponse(res: ServerResponse, filename: string, content: string) {
  res.writeHead(200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
    "X-Content-Type-Options": "nosniff",
  });
  res.end(content);
}

function xmlResponse(res: ServerResponse, filename: string, content: string) {
  res.writeHead(200, {
    "Content-Type": "application/xml; charset=utf-8",
    "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
    "X-Content-Type-Options": "nosniff",
  });
  res.end(content);
}

// ── VAT XML export ────────────────────────────────────────────────────────────

export async function exportVatXml(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const period = url.searchParams.get("period") ?? new Date().toISOString().slice(0, 7);
  const cid = req.auth!.companyId;

  const company = await queryOne<{ name: string; credit_code: string | null; bank_name: string | null; bank_account: string | null }>(
    "SELECT name, credit_code, bank_name, bank_account FROM companies WHERE id = $1", [cid],
  );
  if (!company) { json(res, 404, { error: "公司信息未找到" }); return; }

  // Load taxpayer profiles and resolve active
  const profileRows = await query<{
    id: string; company_id: string; taxpayer_type: string; effective_from: string;
    status: string; notes: string; created_at: string; updated_at: string;
  }>("SELECT * FROM taxpayer_profiles WHERE company_id = $1 ORDER BY effective_from DESC", [cid]);

  const profiles: TaxpayerProfile[] = profileRows.map((r) => ({
    id: r.id, companyId: r.company_id, taxpayerType: r.taxpayer_type as TaxpayerProfile["taxpayerType"],
    effectiveFrom: r.effective_from, status: r.status as TaxpayerProfile["status"],
    notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at,
  }));

  const profile = resolveActiveTaxpayerProfile(profiles, period + "-01");
  if (!profile) { json(res, 400, { error: "未配置纳税人档案，请先在税务中心配置" }); return; }

  const taxRows = await query<{
    id: string; company_id: string; business_event_id: string; mapping_id: string;
    tax_type: string; treatment: string; basis: string; filing_period: string;
    status: string; source: string; created_at: string; updated_at: string;
  }>("SELECT * FROM tax_items WHERE company_id = $1 AND filing_period = $2", [cid, period]);

  const taxItems: TaxItem[] = taxRows.map((r) => ({
    id: r.id, companyId: r.company_id, businessEventId: r.business_event_id,
    mappingId: r.mapping_id, taxType: r.tax_type, treatment: r.treatment,
    basis: r.basis, filingPeriod: r.filing_period, status: r.status as TaxItem["status"],
    source: r.source as TaxItem["source"], createdAt: r.created_at, updatedAt: r.updated_at,
  }));

  const paper = buildVatWorkingPaper(profile, taxItems, period);
  const xml = buildVatDeclarationXml(
    { name: company.name, creditCode: company.credit_code ?? "", bankName: company.bank_name ?? undefined, bankAccount: company.bank_account ?? undefined },
    paper,
  );

  await saveSubmission(cid, "vat", period, "xml", `增值税申报_${period}.xml`, xml, req.auth!.username);
  writeAudit({ companyId: cid, action: "tax.vat.export_xml", resourceType: "filing_period", resourceLabel: period });
  xmlResponse(res, `增值税申报_${period}.xml`, xml);
}

// ── IIT CSV export ────────────────────────────────────────────────────────────

export async function exportIitCsv(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const period = url.searchParams.get("period") ?? new Date().toISOString().slice(0, 7);
  const cid = req.auth!.companyId;

  const company = await queryOne<{ name: string; credit_code: string | null }>(
    "SELECT name, credit_code FROM companies WHERE id = $1", [cid],
  );
  if (!company) { json(res, 404, { error: "公司信息未找到" }); return; }

  const { employees, records, policy } = await loadPayrollData(cid, period);
  if (!policy) { json(res, 400, { error: "未配置工资政策" }); return; }

  const csv = buildIitCsv(employees, records, policy, {
    companyName: company.name, creditCode: company.credit_code ?? "", filingPeriod: period,
  });

  await saveSubmission(cid, "iit", period, "csv", `个人所得税扣缴申报_${period}.csv`, csv, req.auth!.username);
  writeAudit({ companyId: cid, action: "tax.iit.export_csv", resourceType: "filing_period", resourceLabel: period });
  csvResponse(res, `个人所得税扣缴申报_${period}.csv`, csv);
}

// ── SI CSV export ─────────────────────────────────────────────────────────────

export async function exportSiCsv(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const period = url.searchParams.get("period") ?? new Date().toISOString().slice(0, 7);
  const cid = req.auth!.companyId;

  const company = await queryOne<{ name: string; credit_code: string | null }>(
    "SELECT name, credit_code FROM companies WHERE id = $1", [cid],
  );
  if (!company) { json(res, 404, { error: "公司信息未找到" }); return; }
  const { employees, records, policy } = await loadPayrollData(cid, period);
  if (!policy) { json(res, 400, { error: "未配置工资政策" }); return; }

  const csv = buildSiCsv(employees, records, policy, {
    companyName: company.name, creditCode: company.credit_code ?? "", filingPeriod: period,
  });
  await saveSubmission(cid, "si", period, "csv", `社保费申报_${period}.csv`, csv, req.auth!.username);
  writeAudit({ companyId: cid, action: "tax.si.export_csv", resourceType: "filing_period", resourceLabel: period });
  csvResponse(res, `社保费申报_${period}.csv`, csv);
}

// ── Housing fund CSV export ───────────────────────────────────────────────────

export async function exportFundCsv(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const period = url.searchParams.get("period") ?? new Date().toISOString().slice(0, 7);
  const cid = req.auth!.companyId;

  const company = await queryOne<{ name: string; credit_code: string | null }>(
    "SELECT name, credit_code FROM companies WHERE id = $1", [cid],
  );
  if (!company) { json(res, 404, { error: "公司信息未找到" }); return; }
  const { employees, records, policy } = await loadPayrollData(cid, period);
  if (!policy) { json(res, 400, { error: "未配置工资政策" }); return; }

  const csv = buildHousingFundCsv(employees, records, policy, {
    companyName: company.name, creditCode: company.credit_code ?? "", filingPeriod: period,
  });
  await saveSubmission(cid, "housing_fund", period, "csv", `住房公积金汇缴_${period}.csv`, csv, req.auth!.username);
  writeAudit({ companyId: cid, action: "tax.fund.export_csv", resourceType: "filing_period", resourceLabel: period });
  csvResponse(res, `住房公积金汇缴_${period}.csv`, csv);
}

// ── Submission records ────────────────────────────────────────────────────────

export async function listSubmissions(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const period = url.searchParams.get("period");
  const cid = req.auth!.companyId;
  const params: unknown[] = [cid];
  let where = "WHERE company_id = $1";
  if (period) { where += ` AND filing_period = $${params.push(period)}`; }

  const items = await query(
    `SELECT id, tax_type, filing_period, submission_mode, file_format, file_name,
            submission_ref, status, error_message, submitted_at, confirmed_at, created_by_name, created_at
     FROM tax_declaration_submissions ${where} ORDER BY created_at DESC LIMIT 100`,
    params,
  );
  json(res, 200, { items, total: items.length });
}

export async function confirmSubmission(req: ApiRequest, res: ServerResponse, submissionId: string): Promise<void> {
  const body = (req.body ?? {}) as { submissionRef?: string };
  const cid = req.auth!.companyId;
  await query(
    `UPDATE tax_declaration_submissions
     SET status='confirmed', submission_ref=$1, confirmed_at=now(), updated_at=now()
     WHERE id=$2 AND company_id=$3`,
    [body.submissionRef ?? null, submissionId, cid],
  );
  writeAudit({ companyId: cid, action: "tax.submission.confirmed", resourceType: "tax_declaration_submission",
    resourceId: submissionId, changes: { submissionRef: body.submissionRef } });
  json(res, 200, { ok: true });
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function saveSubmission(
  cid: string, taxType: string, period: string,
  format: string, fileName: string, content: string, createdBy: string,
) {
  const id = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await query(
    `INSERT INTO tax_declaration_submissions
       (id, company_id, tax_type, filing_period, submission_mode, file_format, file_name,
        file_content, status, created_by_name, created_at, updated_at)
     VALUES ($1,$2,$3,$4,'manual_file',$5,$6,$7,'generated',$8,now(),now())
     ON CONFLICT DO NOTHING`,
    [id, cid, taxType, period, format, fileName, content, createdBy],
  );
}

async function loadPayrollData(cid: string, period: string): Promise<{
  employees: Employee[]; records: PayrollRecord[]; policy: PayrollPolicy | null;
}> {
  const empRows = await query<{ id: string; name: string; id_card: string }>(
    "SELECT id, name, coalesce(id_card,'') as id_card FROM employees WHERE company_id=$1 AND status='active'", [cid],
  );

  const recRows = await query<{
    id: string; employee_id: string; employee_name: string;
    gross_salary: string; social_security_employee: string; social_security_employer: string;
    housing_fund_employee: string; housing_fund_employer: string;
    iit_withheld: string; net_pay: string; confirmed_at: string | null;
    confirmed_by_user_id: string | null; confirmed_by_name: string; notes: string;
    created_at: string; updated_at: string;
  }>(
    "SELECT * FROM payroll_records WHERE company_id=$1 AND period=$2 AND status='confirmed'", [cid, period],
  );

  const polRows = await query<{
    id: string; social_security_base_min: string; social_security_base_max: string;
    pension_employee_rate: string; pension_employer_rate: string;
    medical_employee_rate: string; medical_employer_rate: string;
    unemployment_employee_rate: string; unemployment_employer_rate: string;
    housing_fund_employee_rate: string; housing_fund_employer_rate: string;
    iit_threshold: string; updated_at: string;
  }>(
    "SELECT * FROM payroll_policies WHERE company_id=$1 ORDER BY updated_at DESC LIMIT 1", [cid],
  );

  const polRow = polRows[0];
  if (!polRow) return { employees: [], records: [], policy: null };

  const employees: Employee[] = empRows.map((r) => ({
    id: r.id, companyId: cid, departmentId: null, name: r.name, idCard: r.id_card,
    position: "", hireDate: null, leaveDate: null, baseSalary: 0,
    status: "active" as const, notes: "", createdAt: "", updatedAt: "",
  }));

  const records: PayrollRecord[] = recRows.map((r) => ({
    id: r.id, companyId: cid, period, employeeId: r.employee_id,
    employeeName: r.employee_name, grossSalary: Number(r.gross_salary),
    socialSecurityEmployee: Number(r.social_security_employee),
    socialSecurityEmployer: Number(r.social_security_employer),
    housingFundEmployee: Number(r.housing_fund_employee),
    housingFundEmployer: Number(r.housing_fund_employer),
    iitWithheld: Number(r.iit_withheld), netPay: Number(r.net_pay),
    status: "confirmed" as const, confirmedAt: r.confirmed_at, confirmedByUserId: r.confirmed_by_user_id,
    confirmedByName: r.confirmed_by_name, notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at,
  }));

  const policy: PayrollPolicy = {
    id: polRow.id, companyId: cid,
    socialSecurityBaseMin: Number(polRow.social_security_base_min),
    socialSecurityBaseMax: Number(polRow.social_security_base_max),
    pensionEmployeeRate: Number(polRow.pension_employee_rate),
    pensionEmployerRate: Number(polRow.pension_employer_rate),
    medicalEmployeeRate: Number(polRow.medical_employee_rate),
    medicalEmployerRate: Number(polRow.medical_employer_rate),
    unemploymentEmployeeRate: Number(polRow.unemployment_employee_rate),
    unemploymentEmployerRate: Number(polRow.unemployment_employer_rate),
    housingFundEmployeeRate: Number(polRow.housing_fund_employee_rate),
    housingFundEmployerRate: Number(polRow.housing_fund_employer_rate),
    iitThreshold: Number(polRow.iit_threshold ?? 5000),
    updatedAt: polRow.updated_at,
  };

  return { employees, records, policy };
}
