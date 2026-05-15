import type { ServerResponse } from "node:http";
import type {
  Employee,
  PayrollPolicy,
  PayrollPeriodSummary,
  PayrollRecord
} from "@finance-taxation/domain-model";
import { query, queryOne } from "../../db/client.js";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { writeAudit } from "../../services/audit.js";

interface EmployeeRow {
  id: string;
  company_id: string;
  department_id: string | null;
  name: string;
  id_card: string;
  position: string;
  hire_date: string | null;
  leave_date: string | null;
  base_salary: string | number;
  status: Employee["status"];
  notes: string;
  created_at: string | Date;
  updated_at: string | Date;
}

interface PayrollPolicyRow {
  id: string;
  company_id: string;
  social_security_base_min: string | number;
  social_security_base_max: string | number;
  pension_employee_rate: string | number;
  pension_employer_rate: string | number;
  medical_employee_rate: string | number;
  medical_employer_rate: string | number;
  unemployment_employee_rate: string | number;
  unemployment_employer_rate: string | number;
  housing_fund_employee_rate: string | number;
  housing_fund_employer_rate: string | number;
  iit_threshold: string | number;
  updated_at: string | Date;
}

interface PayrollRecordRow {
  id: string;
  company_id: string;
  period: string;
  employee_id: string;
  employee_name: string;
  gross_salary: string | number;
  social_security_employee: string | number;
  social_security_employer: string | number;
  housing_fund_employee: string | number;
  housing_fund_employer: string | number;
  iit_withheld: string | number;
  net_pay: string | number;
  status: PayrollRecord["status"];
  confirmed_at: string | Date | null;
  confirmed_by_user_id: string | null;
  confirmed_by_name: string;
  notes: string;
  created_at: string | Date;
  updated_at: string | Date;
}

function toIso(v: string | Date | null | undefined): string | null {
  if (!v) return null;
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

function mapEmployee(row: EmployeeRow): Employee {
  return {
    id: row.id,
    companyId: row.company_id,
    departmentId: row.department_id,
    name: row.name,
    idCard: row.id_card,
    position: row.position,
    hireDate: row.hire_date ?? null,
    leaveDate: row.leave_date ?? null,
    baseSalary: Number(row.base_salary),
    status: row.status,
    notes: row.notes,
    createdAt: toIso(row.created_at) ?? "",
    updatedAt: toIso(row.updated_at) ?? ""
  };
}

function mapPolicy(row: PayrollPolicyRow): PayrollPolicy {
  return {
    id: row.id,
    companyId: row.company_id,
    socialSecurityBaseMin: Number(row.social_security_base_min),
    socialSecurityBaseMax: Number(row.social_security_base_max),
    pensionEmployeeRate: Number(row.pension_employee_rate),
    pensionEmployerRate: Number(row.pension_employer_rate),
    medicalEmployeeRate: Number(row.medical_employee_rate),
    medicalEmployerRate: Number(row.medical_employer_rate),
    unemploymentEmployeeRate: Number(row.unemployment_employee_rate),
    unemploymentEmployerRate: Number(row.unemployment_employer_rate),
    housingFundEmployeeRate: Number(row.housing_fund_employee_rate),
    housingFundEmployerRate: Number(row.housing_fund_employer_rate),
    iitThreshold: Number(row.iit_threshold),
    updatedAt: toIso(row.updated_at) ?? ""
  };
}

function mapRecord(row: PayrollRecordRow): PayrollRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    period: row.period,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    grossSalary: Number(row.gross_salary),
    socialSecurityEmployee: Number(row.social_security_employee),
    socialSecurityEmployer: Number(row.social_security_employer),
    housingFundEmployee: Number(row.housing_fund_employee),
    housingFundEmployer: Number(row.housing_fund_employer),
    iitWithheld: Number(row.iit_withheld),
    netPay: Number(row.net_pay),
    status: row.status,
    confirmedAt: toIso(row.confirmed_at),
    confirmedByUserId: row.confirmed_by_user_id,
    confirmedByName: row.confirmed_by_name,
    notes: row.notes,
    createdAt: toIso(row.created_at) ?? "",
    updatedAt: toIso(row.updated_at) ?? ""
  };
}

function calcIit(taxableIncome: number): number {
  if (taxableIncome <= 0) return 0;
  const brackets = [
    { limit: 3000,  rate: 0.03, deduction: 0 },
    { limit: 12000, rate: 0.10, deduction: 210 },
    { limit: 25000, rate: 0.20, deduction: 1410 },
    { limit: 35000, rate: 0.25, deduction: 2660 },
    { limit: 55000, rate: 0.30, deduction: 4410 },
    { limit: 80000, rate: 0.35, deduction: 7160 },
    { limit: Infinity, rate: 0.45, deduction: 15160 }
  ];
  for (const b of brackets) {
    if (taxableIncome <= b.limit) {
      return Math.max(0, taxableIncome * b.rate - b.deduction);
    }
  }
  return 0;
}

// ─── Employee CRUD ────────────────────────────────────────────────────────────

export async function listEmployees(req: ApiRequest, res: ServerResponse) {
  const companyId = req.auth!.companyId;
  const url = new URL(req.url!, "http://x");
  const status = url.searchParams.get("status");

  const params: unknown[] = [companyId];
  let where = "company_id = $1";
  if (status) {
    where += ` and status = $2`;
    params.push(status);
  }

  const rows = await query<EmployeeRow>(
    `select * from employees where ${where} order by name asc`,
    params
  );
  return json(res, 200, { items: rows.map(mapEmployee), total: rows.length });
}

export async function createEmployee(req: ApiRequest, res: ServerResponse) {
  const companyId = req.auth!.companyId;
  const body = req.body as Partial<{
    name: string;
    idCard: string;
    departmentId: string;
    position: string;
    hireDate: string;
    baseSalary: number;
    notes: string;
  }>;

  if (!body.name) return json(res, 400, { error: "name is required" });

  const id = `emp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const row = await queryOne<EmployeeRow>(
    `
      insert into employees (id, company_id, department_id, name, id_card, position, hire_date, base_salary, notes)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      returning *
    `,
    [
      id, companyId,
      body.departmentId ?? null,
      body.name,
      body.idCard ?? "",
      body.position ?? "",
      body.hireDate ?? null,
      body.baseSalary ?? 0,
      body.notes ?? ""
    ]
  );
  return json(res, 201, { employee: mapEmployee(row!) });
}

export async function updateEmployee(req: ApiRequest, res: ServerResponse, employeeId: string) {
  const companyId = req.auth!.companyId;
  const body = req.body as Partial<{
    name: string; position: string; baseSalary: number;
    hireDate: string; leaveDate: string; status: string; notes: string;
  }>;

  const existing = await queryOne<EmployeeRow>(
    `select * from employees where id = $1 and company_id = $2`,
    [employeeId, companyId]
  );
  if (!existing) return json(res, 404, { error: "Employee not found" });

  const row = await queryOne<EmployeeRow>(
    `
      update employees set
        name = $1, position = $2, base_salary = $3,
        hire_date = $4, leave_date = $5, status = $6, notes = $7,
        updated_at = now()
      where id = $8 and company_id = $9
      returning *
    `,
    [
      body.name ?? existing.name,
      body.position ?? existing.position,
      body.baseSalary ?? existing.base_salary,
      body.hireDate ?? existing.hire_date,
      body.leaveDate ?? existing.leave_date,
      body.status ?? existing.status,
      body.notes ?? existing.notes,
      employeeId, companyId
    ]
  );
  return json(res, 200, { employee: mapEmployee(row!) });
}

// ─── Payroll Policy ───────────────────────────────────────────────────────────

export async function getPayrollPolicy(req: ApiRequest, res: ServerResponse) {
  const companyId = req.auth!.companyId;
  const row = await queryOne<PayrollPolicyRow>(
    `select * from payroll_policy where company_id = $1`,
    [companyId]
  );
  if (!row) return json(res, 404, { error: "Payroll policy not configured" });
  return json(res, 200, { policy: mapPolicy(row) });
}

export async function updatePayrollPolicy(req: ApiRequest, res: ServerResponse) {
  const companyId = req.auth!.companyId;
  const body = req.body as Partial<PayrollPolicy>;

  const existing = await queryOne<PayrollPolicyRow>(
    `select * from payroll_policy where company_id = $1`,
    [companyId]
  );
  if (!existing) {
    const id = `pp-${companyId}-${Date.now()}`;
    const row = await queryOne<PayrollPolicyRow>(
      `insert into payroll_policy (id, company_id) values ($1,$2) returning *`,
      [id, companyId]
    );
    return json(res, 201, { policy: mapPolicy(row!) });
  }

  const row = await queryOne<PayrollPolicyRow>(
    `
      update payroll_policy set
        social_security_base_min   = $1,
        social_security_base_max   = $2,
        pension_employee_rate      = $3,
        pension_employer_rate      = $4,
        medical_employee_rate      = $5,
        medical_employer_rate      = $6,
        unemployment_employee_rate = $7,
        unemployment_employer_rate = $8,
        housing_fund_employee_rate = $9,
        housing_fund_employer_rate = $10,
        iit_threshold              = $11,
        updated_at                 = now()
      where company_id = $12
      returning *
    `,
    [
      body.socialSecurityBaseMin ?? existing.social_security_base_min,
      body.socialSecurityBaseMax ?? existing.social_security_base_max,
      body.pensionEmployeeRate ?? existing.pension_employee_rate,
      body.pensionEmployerRate ?? existing.pension_employer_rate,
      body.medicalEmployeeRate ?? existing.medical_employee_rate,
      body.medicalEmployerRate ?? existing.medical_employer_rate,
      body.unemploymentEmployeeRate ?? existing.unemployment_employee_rate,
      body.unemploymentEmployerRate ?? existing.unemployment_employer_rate,
      body.housingFundEmployeeRate ?? existing.housing_fund_employee_rate,
      body.housingFundEmployerRate ?? existing.housing_fund_employer_rate,
      body.iitThreshold ?? existing.iit_threshold,
      companyId
    ]
  );
  return json(res, 200, { policy: mapPolicy(row!) });
}

// ─── Payroll Compute & Confirm ────────────────────────────────────────────────

export async function computePayroll(req: ApiRequest, res: ServerResponse) {
  const companyId = req.auth!.companyId;
  const body = req.body as { period: string };

  if (!body.period) return json(res, 400, { error: "period is required (e.g. 2026-05)" });

  const policy = await queryOne<PayrollPolicyRow>(
    `select * from payroll_policy where company_id = $1`,
    [companyId]
  );
  if (!policy) return json(res, 400, { error: "Payroll policy not configured" });

  const employees = await query<EmployeeRow>(
    `select * from employees where company_id = $1 and status = 'active'`,
    [companyId]
  );

  const ssBase = (gross: number) =>
    Math.min(
      Math.max(gross, Number(policy.social_security_base_min)),
      Number(policy.social_security_base_max)
    );

  for (const emp of employees) {
    const gross = Number(emp.base_salary);
    const base = ssBase(gross);
    const ssEmp =
      base * (Number(policy.pension_employee_rate) + Number(policy.medical_employee_rate) + Number(policy.unemployment_employee_rate));
    const ssEr =
      base * (Number(policy.pension_employer_rate) + Number(policy.medical_employer_rate) + Number(policy.unemployment_employer_rate));
    const hfEmp = base * Number(policy.housing_fund_employee_rate);
    const hfEr = base * Number(policy.housing_fund_employer_rate);
    const taxable = Math.max(0, gross - ssEmp - hfEmp - Number(policy.iit_threshold));
    const iit = calcIit(taxable);
    const net = gross - ssEmp - hfEmp - iit;

    const id = `pr-${companyId}-${body.period}-${emp.id}`;
    await query(
      `
        insert into payroll_records (
          id, company_id, period, employee_id, employee_name,
          gross_salary, social_security_employee, social_security_employer,
          housing_fund_employee, housing_fund_employer,
          iit_withheld, net_pay, status
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draft')
        on conflict (company_id, period, employee_id) do update set
          gross_salary               = excluded.gross_salary,
          social_security_employee   = excluded.social_security_employee,
          social_security_employer   = excluded.social_security_employer,
          housing_fund_employee      = excluded.housing_fund_employee,
          housing_fund_employer      = excluded.housing_fund_employer,
          iit_withheld               = excluded.iit_withheld,
          net_pay                    = excluded.net_pay,
          updated_at                 = now()
        where payroll_records.status = 'draft'
      `,
      [id, companyId, body.period, emp.id, emp.name, gross, ssEmp, ssEr, hfEmp, hfEr, iit, net]
    );
  }

  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    userName: req.auth!.username,
    action: "compute",
    resourceType: "payroll",
    resourceId: body.period,
    resourceLabel: `工资计算 ${body.period}`,
    changes: { data: { period: body.period, employeeCount: employees.length } }
  });
  return listPayroll(req, res);
}

export async function listPayroll(req: ApiRequest, res: ServerResponse) {
  const companyId = req.auth!.companyId;
  const url = new URL(req.url!, "http://x");
  const period = url.searchParams.get("period") ?? req.body?.period ?? "";

  const params: unknown[] = [companyId];
  let where = "company_id = $1";
  if (period) {
    where += " and period = $2";
    params.push(period);
  }

  const rows = await query<PayrollRecordRow>(
    `select * from payroll_records where ${where} order by period desc, employee_name asc`,
    params
  );

  if (!rows.length) return json(res, 200, { items: [], total: 0, summary: null });

  const summary: PayrollPeriodSummary = {
    period: period || rows[0]?.period || "",
    headcount: rows.length,
    totalGross: rows.reduce((s, r) => s + Number(r.gross_salary), 0),
    totalSocialSecurityEmployee: rows.reduce((s, r) => s + Number(r.social_security_employee), 0),
    totalSocialSecurityEmployer: rows.reduce((s, r) => s + Number(r.social_security_employer), 0),
    totalHousingFundEmployee: rows.reduce((s, r) => s + Number(r.housing_fund_employee), 0),
    totalHousingFundEmployer: rows.reduce((s, r) => s + Number(r.housing_fund_employer), 0),
    totalIit: rows.reduce((s, r) => s + Number(r.iit_withheld), 0),
    totalNetPay: rows.reduce((s, r) => s + Number(r.net_pay), 0),
    status: rows.every((r) => r.status === "confirmed")
      ? "confirmed"
      : rows.some((r) => r.status === "confirmed")
        ? "mixed"
        : "draft"
  };

  return json(res, 200, { items: rows.map(mapRecord), total: rows.length, summary });
}

export async function confirmPayroll(req: ApiRequest, res: ServerResponse, payrollId: string) {
  const companyId = req.auth!.companyId;
  const displayName = req.auth!.displayName || "系统";

  const row = await queryOne<PayrollRecordRow>(
    `
      update payroll_records set
        status                 = 'confirmed',
        confirmed_at           = now(),
        confirmed_by_user_id   = $1,
        confirmed_by_name      = $2,
        updated_at             = now()
      where id = $3 and company_id = $4 and status = 'draft'
      returning *
    `,
    [req.auth!.userId ?? null, displayName, payrollId, companyId]
  );
  if (!row) return json(res, 404, { error: "Payroll record not found or already confirmed" });

  const confirmed = mapRecord(row);
  writeAudit({
    companyId,
    userId: req.auth!.userId,
    userName: req.auth!.username,
    action: "confirm",
    resourceType: "payroll",
    resourceId: payrollId,
    resourceLabel: `工资确认 ${confirmed.period} - ${confirmed.employeeName}`,
    changes: { after: { status: "confirmed" } }
  });
  return json(res, 200, { record: confirmed });
}

export async function getPayrollPeriods(req: ApiRequest, res: ServerResponse) {
  const companyId = req.auth!.companyId;
  const rows = await query<{ period: string; headcount: string; total_gross: string; status_mix: string }>(
    `
      select
        period,
        count(*)::int as headcount,
        sum(gross_salary) as total_gross,
        case
          when bool_and(status = 'confirmed') then 'confirmed'
          when bool_or(status = 'confirmed') then 'mixed'
          else 'draft'
        end as status_mix
      from payroll_records
      where company_id = $1
      group by period
      order by period desc
    `,
    [companyId]
  );
  return json(res, 200, {
    periods: rows.map((r) => ({
      period: r.period,
      headcount: Number(r.headcount),
      totalGross: Number(r.total_gross),
      status: r.status_mix
    }))
  });
}
