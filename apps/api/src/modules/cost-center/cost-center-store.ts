/**
 * 成本中心主数据与部门费用取数（V12-D1）。
 */

import { query } from "../../db/client.js";
import type { PoolClient } from "pg";
import { toCents } from "../../utils/money.js";
import type { CostEntry } from "./cost-center.js";

export interface CostCenter {
  id: string;
  companyId: string;
  code: string;
  name: string;
  departmentId: string | null;
  departmentName: string | null;
  notes: string;
  isActive: boolean;
  sortOrder: number;
}

interface CostCenterRow {
  id: string;
  company_id: string;
  code: string;
  name: string;
  department_id: string | null;
  department_name: string | null;
  notes: string;
  is_active: boolean;
  sort_order: number;
}

function mapRow(row: CostCenterRow): CostCenter {
  return {
    id: row.id,
    companyId: row.company_id,
    code: row.code,
    name: row.name,
    departmentId: row.department_id,
    departmentName: row.department_name,
    notes: row.notes,
    isActive: row.is_active,
    sortOrder: row.sort_order
  };
}

export async function listCostCenters(
  companyId: string,
  options: { includeInactive?: boolean } = {}
): Promise<CostCenter[]> {
  const rows = await query<CostCenterRow>(
    `select c.id, c.company_id, c.code, c.name, c.department_id,
            d.name as department_name, c.notes, c.is_active, c.sort_order
     from cost_centers c
     left join departments d on d.id = c.department_id
     where c.company_id = $1 and ($2::boolean or c.is_active)
     order by c.sort_order, c.code`,
    [companyId, options.includeInactive ?? false]
  );
  return rows.map(mapRow);
}

export interface CreateCostCenterInput {
  companyId: string;
  code: string;
  name: string;
  departmentId?: string | null;
  notes?: string | null;
  sortOrder?: number;
}

export type CostCenterFailure = {
  code: "COST_CENTER_FIELDS_REQUIRED" | "COST_CENTER_CODE_DUPLICATE" | "COST_CENTER_NOT_FOUND";
  message: string;
};

export async function createCostCenter(
  input: CreateCostCenterInput
): Promise<{ ok: true; costCenter: CostCenter } | { ok: false; failure: CostCenterFailure }> {
  const code = input.code.trim();
  const name = input.name.trim();
  if (!code || !name) {
    return {
      ok: false,
      failure: { code: "COST_CENTER_FIELDS_REQUIRED", message: "编码与名称均必填。" }
    };
  }

  const existing = await query<{ id: string; is_active: boolean }>(
    `select id, is_active from cost_centers where company_id = $1 and code = $2`,
    [input.companyId, code]
  );
  if (existing.length > 0) {
    return {
      ok: false,
      failure: {
        code: "COST_CENTER_CODE_DUPLICATE",
        message: existing[0]!.is_active
          ? `成本中心编码 ${code} 已存在。`
          : `成本中心编码 ${code} 属于一个已停用的成本中心。停用的仍占用编码——历史分录还指着它，编码被复用会让旧报表串户。请改用其他编码，或重新启用原成本中心。`
      }
    };
  }

  const id = `cc-${input.companyId}-${code}`;
  const rows = await query<CostCenterRow>(
    `insert into cost_centers (id, company_id, code, name, department_id, notes, sort_order)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id, company_id, code, name, department_id,
               null::text as department_name, notes, is_active, sort_order`,
    [
      id,
      input.companyId,
      code,
      name,
      input.departmentId ?? null,
      input.notes ?? "",
      input.sortOrder ?? 0
    ]
  );
  return { ok: true, costCenter: mapRow(rows[0]!) };
}

/**
 * 停用/启用成本中心。
 *
 * **没有删除**：历史分录指着它，删掉会让旧报表出现查不到名字的成本中心。
 * 与科目主数据（`accounts`）同一处理。
 */
export async function setCostCenterActive(
  companyId: string,
  costCenterId: string,
  isActive: boolean
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `update cost_centers set is_active = $3, updated_at = now()
     where company_id = $1 and id = $2 returning id`,
    [companyId, costCenterId, isActive]
  );
  return rows.length > 0;
}

interface CostEntryRow {
  cost_center_id: string | null;
  cost_center_name: string | null;
  account_code: string;
  account_name: string;
  amount: string;
}

/**
 * 取某期间的费用分录，按成本中心 + 科目预聚合。
 *
 * 聚合放在 SQL 里而不是全量拉回内存：一家活跃公司一个月的费用分录轻松上千条，
 * 而报表只需要「成本中心 × 科目」这个粒度。
 *
 * **排除结转分录**：期末结转把损益科目清零的那些分录不是本期费用发生额，
 * 算进来会让每个部门的费用在结转后变成 0。口径与利润表一致
 *（见 ledger/closing-sources.ts）。
 */
export async function loadCostEntries(
  companyId: string,
  period: string,
  client?: PoolClient
): Promise<CostEntry[]> {
  const sql = `
    select e.cost_center_id,
           c.name as cost_center_name,
           e.account_code,
           e.account_name,
           sum(e.debit - e.credit)::text as amount
    from ledger_entries e
    join accounts a on a.company_id = e.company_id and a.code = e.account_code
    left join cost_centers c on c.id = e.cost_center_id
    where e.company_id = $1
      and to_char(e.entry_date, 'YYYY-MM') = $2
      and a.category in ('expense', 'cost')
      and a.account_type <> 'expense_tax'
      and e.source is distinct from 'period_closing'
      and e.source is distinct from 'annual_closing'
    group by e.cost_center_id, c.name, e.account_code, e.account_name
  `;
  const rows: CostEntryRow[] = client
    ? (await client.query<CostEntryRow>(sql, [companyId, period])).rows
    : await query<CostEntryRow>(sql, [companyId, period]);

  return rows.map((row) => ({
    costCenterId: row.cost_center_id,
    // 有 id 但查不到名字说明成本中心档案被删了（外键是刻意不加的，
    // 见迁移 068）——如实显示 id 而不是空白，方便追查
    costCenterName:
      row.cost_center_name ?? (row.cost_center_id ? `未知成本中心 ${row.cost_center_id}` : "未指定成本中心"),
    accountCode: row.account_code,
    accountName: row.account_name,
    amountCents: toCents(row.amount)
  }));
}
