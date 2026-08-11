/**
 * 税率主数据的读写（V12-D2）。
 */

import { query } from "../../db/client.js";
import type { TaxRate } from "./tax-rate.js";

interface TaxRateRow {
  id: string;
  company_id: string | null;
  tax_type: string;
  code: string;
  name: string;
  rate: string;
  levy_rate: string | null;
  taxpayer_type: TaxRate["taxpayerType"];
  applicable_scope: string;
  effective_from: string | Date;
  effective_to: string | Date | null;
  sort_order: number;
}

function toDateOnly(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function mapRow(row: TaxRateRow): TaxRate {
  return {
    id: row.id,
    companyId: row.company_id,
    taxType: row.tax_type,
    code: row.code,
    name: row.name,
    rate: Number(row.rate),
    levyRate: row.levy_rate === null ? null : Number(row.levy_rate),
    taxpayerType: row.taxpayer_type,
    applicableScope: row.applicable_scope,
    effectiveFrom: toDateOnly(row.effective_from)!,
    effectiveTo: toDateOnly(row.effective_to),
    sortOrder: row.sort_order
  };
}

/**
 * 取某公司可见的全部税率：系统内置（`company_id is null`）+ 本公司自定义。
 *
 * **不在 SQL 里按日期过滤**——历史档要留给解析函数看，重算旧期间的底稿
 * 需要它们。按日期挑哪一条是 `resolveTaxRate` 的职责，规则集中在一处。
 */
export async function listTaxRates(companyId: string, taxType?: string): Promise<TaxRate[]> {
  const rows = await query<TaxRateRow>(
    `select id, company_id, tax_type, code, name, rate::text, levy_rate::text,
            taxpayer_type, applicable_scope, effective_from, effective_to, sort_order
     from tax_rates
     where (company_id is null or company_id = $1)
       and ($2::text is null or tax_type = $2)
     order by tax_type, sort_order, effective_from desc`,
    [companyId, taxType ?? null]
  );
  return rows.map(mapRow);
}

export interface CreateTaxRateInput {
  companyId: string;
  taxType: string;
  code: string;
  name: string;
  rate: number;
  levyRate?: number | null;
  taxpayerType?: TaxRate["taxpayerType"];
  applicableScope?: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  sortOrder?: number;
}

export type CreateTaxRateFailure = {
  code:
    | "TAX_RATE_FIELDS_REQUIRED"
    | "TAX_RATE_RANGE_INVALID"
    | "TAX_RATE_PERIOD_INVALID"
    | "TAX_RATE_OVERLAPS";
  message: string;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 新增公司自定义税率。
 *
 * **不允许改系统内置税率，也不允许改已有记录的税率数值**——税率改版的正确
 * 做法是给旧行封口、插一条新行。改写历史税率等于把已申报的底稿悄悄改掉，
 * 而那些数字是报给税务局的。
 */
export async function createTaxRate(
  input: CreateTaxRateInput
): Promise<{ ok: true; rate: TaxRate } | { ok: false; failure: CreateTaxRateFailure }> {
  const code = input.code.trim();
  const name = input.name.trim();
  if (!code || !name || !input.taxType.trim()) {
    return {
      ok: false,
      failure: { code: "TAX_RATE_FIELDS_REQUIRED", message: "taxType、code、name 均必填。" }
    };
  }
  if (!Number.isFinite(input.rate) || input.rate < 0 || input.rate > 100) {
    return {
      ok: false,
      failure: { code: "TAX_RATE_RANGE_INVALID", message: "税率必须在 0 到 100 之间（以百分数表示）。" }
    };
  }
  if (input.levyRate != null && (input.levyRate < 0 || input.levyRate > input.rate)) {
    return {
      ok: false,
      failure: {
        code: "TAX_RATE_RANGE_INVALID",
        message: `实际征收率 ${input.levyRate}% 不能高于法定税率 ${input.rate}%——减征只会往下减。`
      }
    };
  }
  if (!DATE_PATTERN.test(input.effectiveFrom)) {
    return {
      ok: false,
      failure: { code: "TAX_RATE_PERIOD_INVALID", message: "生效日必须形如 YYYY-MM-DD。" }
    };
  }
  if (input.effectiveTo && (!DATE_PATTERN.test(input.effectiveTo) || input.effectiveTo < input.effectiveFrom)) {
    return {
      ok: false,
      failure: { code: "TAX_RATE_PERIOD_INVALID", message: "失效日不能早于生效日。" }
    };
  }

  // 同一 code 的生效区间不得重叠：重叠会让"这一天该用哪档"有两个答案，
  // 而解析函数只会返回一个，结果取决于排序——静默的不确定性比报错糟糕得多。
  const overlapping = await query<{ id: string; effective_from: string | Date }>(
    `select id, effective_from from tax_rates
     where company_id = $1 and tax_type = $2 and code = $3
       and effective_from <= coalesce($5::date, 'infinity'::date)
       and coalesce(effective_to, 'infinity'::date) >= $4::date`,
    [input.companyId, input.taxType, code, input.effectiveFrom, input.effectiveTo ?? null]
  );
  if (overlapping.length > 0) {
    return {
      ok: false,
      failure: {
        code: "TAX_RATE_OVERLAPS",
        message:
          `税率 ${code} 已有生效区间与此重叠（${overlapping.map((row) => toDateOnly(row.effective_from)).join("、")} 起）。` +
          `同一档税率在同一天只能有一个值——请先给旧记录填上失效日，再新增。`
      }
    };
  }

  const id = `rate-${input.companyId}-${code}-${input.effectiveFrom}`;
  const rows = await query<TaxRateRow>(
    `insert into tax_rates (
       id, company_id, tax_type, code, name, rate, levy_rate,
       taxpayer_type, applicable_scope, effective_from, effective_to, sort_order
     ) values ($1, $2, $3, $4, $5, $6::numeric, $7::numeric, $8, $9, $10::date, $11::date, $12)
     returning id, company_id, tax_type, code, name, rate::text, levy_rate::text,
               taxpayer_type, applicable_scope, effective_from, effective_to, sort_order`,
    [
      id,
      input.companyId,
      input.taxType,
      code,
      name,
      input.rate,
      input.levyRate ?? null,
      input.taxpayerType ?? null,
      input.applicableScope ?? "",
      input.effectiveFrom,
      input.effectiveTo ?? null,
      input.sortOrder ?? 100
    ]
  );

  return { ok: true, rate: mapRow(rows[0]!) };
}

/**
 * 给一条自定义税率封口（设置失效日）。
 *
 * 这是税率"改版"的正确路径：封口旧行 + 新增新行，历史可重算。
 * 只能封本公司的记录，系统内置税率的沿革由迁移维护。
 */
export async function expireTaxRate(
  companyId: string,
  rateId: string,
  effectiveTo: string
): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `update tax_rates set effective_to = $3::date, updated_at = now()
     where company_id = $1 and id = $2 and effective_from <= $3::date
     returning id`,
    [companyId, rateId, effectiveTo]
  );
  return rows.length > 0;
}
