/**
 * 固定资产台账读写（V12-C1）。
 *
 * 建卡是唯一的入口 —— 折旧和处置都从台账取参数，台账错了后面全错，所以校验
 * 集中在这里，而不是散在每个调用方。
 */

import type { PoolClient } from "pg";
import { fromCents, toCents } from "../../utils/money.js";
import { addMonths, type DepreciableAsset } from "./depreciation.js";

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface FixedAsset {
  id: string;
  companyId: string;
  assetNo: string;
  name: string;
  category: string;
  acquiredOn: string;
  originalCost: string;
  salvageValue: string;
  usefulLifeMonths: number;
  depreciationStartPeriod: string;
  assetAccountCode: string;
  accumulatedAccountCode: string;
  expenseAccountCode: string;
  status: "in_use" | "disposed";
  disposedOn: string | null;
  disposedPeriod: string | null;
}

export interface CreateFixedAssetInput {
  companyId: string;
  assetNo: string;
  name: string;
  category?: string;
  acquiredOn: string;
  originalCost: string | number;
  salvageValue?: string | number;
  usefulLifeMonths: number;
  expenseAccountCode: string;
  assetAccountCode?: string;
  accumulatedAccountCode?: string;
  /**
   * 开始计提折旧的期间。**默认取购置次月**（中国准则：当月增加当月不提）。
   * 仅在迁入存量资产时才显式传 —— 那种资产在旧账里早已开始计提。
   */
  depreciationStartPeriod?: string;
}

export type FixedAssetFailure = {
  code:
    | "ASSET_NO_DUPLICATE"
    | "ASSET_DATE_INVALID"
    | "ASSET_PERIOD_INVALID"
    | "ASSET_COST_INVALID"
    | "ASSET_SALVAGE_INVALID"
    | "ASSET_LIFE_INVALID"
    | "ASSET_NOT_FOUND"
    | "ASSET_ALREADY_DISPOSED";
  message: string;
};

interface AssetRow {
  id: string;
  company_id: string;
  asset_no: string;
  name: string;
  category: string;
  acquired_on: string | Date;
  original_cost: string;
  salvage_value: string;
  useful_life_months: number;
  depreciation_start_period: string;
  asset_account_code: string;
  accumulated_account_code: string;
  expense_account_code: string;
  status: "in_use" | "disposed";
  disposed_on: string | Date | null;
  disposed_period: string | null;
}

/**
 * `date` 列在 node-postgres 下是字符串，但 `timestamptz` 是 Date 对象。
 * 两次线上 500（凭证 PDF、银行对账）都是把 Date 当字符串 `.slice()` 造成的，
 * 所以这里如实接受两种类型再收敛，而不是断言成 string。
 */
function toDateOnly(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function mapRow(row: AssetRow): FixedAsset {
  return {
    id: row.id,
    companyId: row.company_id,
    assetNo: row.asset_no,
    name: row.name,
    category: row.category,
    acquiredOn: toDateOnly(row.acquired_on)!,
    originalCost: row.original_cost,
    salvageValue: row.salvage_value,
    usefulLifeMonths: row.useful_life_months,
    depreciationStartPeriod: row.depreciation_start_period,
    assetAccountCode: row.asset_account_code,
    accumulatedAccountCode: row.accumulated_account_code,
    expenseAccountCode: row.expense_account_code,
    status: row.status,
    disposedOn: toDateOnly(row.disposed_on),
    disposedPeriod: row.disposed_period
  };
}

const SELECT_COLUMNS = `
  id, company_id, asset_no, name, category, acquired_on, original_cost, salvage_value,
  useful_life_months, depreciation_start_period, asset_account_code, accumulated_account_code,
  expense_account_code, status, disposed_on, disposed_period
`;

/** 台账记录转成折旧计算所需的形状。 */
export function toDepreciableAsset(asset: FixedAsset): DepreciableAsset {
  return {
    originalCostCents: toCents(asset.originalCost),
    salvageValueCents: toCents(asset.salvageValue),
    usefulLifeMonths: asset.usefulLifeMonths,
    depreciationStartPeriod: asset.depreciationStartPeriod,
    disposedPeriod: asset.disposedPeriod
  };
}

/** 购置次月 —— 中国准则「当月增加的固定资产，当月不提折旧」的落点。 */
export function defaultDepreciationStartPeriod(acquiredOn: string): string {
  return addMonths(acquiredOn.slice(0, 7), 1);
}

function validate(input: CreateFixedAssetInput): FixedAssetFailure | null {
  if (!DATE_PATTERN.test(input.acquiredOn)) {
    return { code: "ASSET_DATE_INVALID", message: "购置日期必须形如 YYYY-MM-DD。" };
  }
  if (input.depreciationStartPeriod && !PERIOD_PATTERN.test(input.depreciationStartPeriod)) {
    return { code: "ASSET_PERIOD_INVALID", message: "开始折旧期间必须形如 YYYY-MM。" };
  }

  const costCents = toCents(input.originalCost);
  if (!Number.isFinite(costCents) || costCents <= 0) {
    return { code: "ASSET_COST_INVALID", message: "入账原值必须大于 0。" };
  }

  const salvageCents = toCents(input.salvageValue ?? 0);
  if (!Number.isFinite(salvageCents) || salvageCents < 0) {
    return { code: "ASSET_SALVAGE_INVALID", message: "预计净残值不能为负数。" };
  }
  if (salvageCents > costCents) {
    return {
      code: "ASSET_SALVAGE_INVALID",
      message: `预计净残值（${fromCents(salvageCents)}）不能大于入账原值（${fromCents(costCents)}）。`
    };
  }

  if (!Number.isInteger(input.usefulLifeMonths) || input.usefulLifeMonths <= 0) {
    return { code: "ASSET_LIFE_INVALID", message: "预计使用月数必须是大于 0 的整数。" };
  }
  return null;
}

export type CreateFixedAssetResult =
  | { ok: true; asset: FixedAsset }
  | { ok: false; failure: FixedAssetFailure };

export async function createFixedAsset(
  client: PoolClient,
  input: CreateFixedAssetInput
): Promise<CreateFixedAssetResult> {
  const invalid = validate(input);
  if (invalid) return { ok: false, failure: invalid };

  const duplicate = await client.query(
    `select 1 from fixed_assets where company_id = $1 and asset_no = $2`,
    [input.companyId, input.assetNo]
  );
  if (duplicate.rowCount && duplicate.rowCount > 0) {
    return {
      ok: false,
      failure: {
        code: "ASSET_NO_DUPLICATE",
        message: `资产编号 ${input.assetNo} 已存在。`
      }
    };
  }

  const startPeriod =
    input.depreciationStartPeriod ?? defaultDepreciationStartPeriod(input.acquiredOn);
  const id = `fa-${input.companyId}-${input.assetNo}`;

  const inserted = await client.query<AssetRow>(
    `insert into fixed_assets (
       id, company_id, asset_no, name, category, acquired_on,
       original_cost, salvage_value, useful_life_months, depreciation_start_period,
       asset_account_code, accumulated_account_code, expense_account_code
     ) values ($1, $2, $3, $4, $5, $6::date, $7::numeric, $8::numeric, $9, $10, $11, $12, $13)
     returning ${SELECT_COLUMNS}`,
    [
      id,
      input.companyId,
      input.assetNo,
      input.name,
      input.category ?? "equipment",
      input.acquiredOn,
      fromCents(toCents(input.originalCost)),
      fromCents(toCents(input.salvageValue ?? 0)),
      input.usefulLifeMonths,
      startPeriod,
      input.assetAccountCode ?? "1601",
      input.accumulatedAccountCode ?? "1602",
      input.expenseAccountCode
    ]
  );

  const row = inserted.rows[0];
  if (!row) {
    // insert ... returning 必然返回一行；真返回不了说明发生了插入被吞掉这类
    // 更严重的问题，抛出去比返回一个假的成功结果安全。
    throw new Error(`建卡后未能读回资产记录：${input.assetNo}`);
  }
  return { ok: true, asset: mapRow(row) };
}

export async function findFixedAsset(
  client: PoolClient,
  companyId: string,
  assetId: string
): Promise<FixedAsset | null> {
  const result = await client.query<AssetRow>(
    `select ${SELECT_COLUMNS} from fixed_assets where company_id = $1 and id = $2`,
    [companyId, assetId]
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function listFixedAssets(
  client: PoolClient,
  companyId: string,
  options: { status?: "in_use" | "disposed" } = {}
): Promise<FixedAsset[]> {
  const result = await client.query<AssetRow>(
    `select ${SELECT_COLUMNS} from fixed_assets
     where company_id = $1 and ($2::text is null or status = $2)
     order by asset_no`,
    [companyId, options.status ?? null]
  );
  return result.rows.map(mapRow);
}

/**
 * 在用资产 —— 折旧计提的取数口径。
 *
 * 包含处置当月的资产：中国准则规定当月减少的固定资产当月照提折旧，
 * 若这里按 `status = 'in_use'` 过滤，处置月就会漏提一个月的费用。
 * 是否真的计提由 `depreciationForPeriod` 按期间判定。
 */
export async function listDepreciableAssets(
  client: PoolClient,
  companyId: string,
  period: string
): Promise<FixedAsset[]> {
  const result = await client.query<AssetRow>(
    `select ${SELECT_COLUMNS} from fixed_assets
     where company_id = $1
       and depreciation_start_period <= $2
       and (disposed_period is null or disposed_period >= $2)
     order by asset_no`,
    [companyId, period]
  );
  return result.rows.map(mapRow);
}

/** 某资产截至（不含）指定期间的累计折旧额，单位分。 */
export async function accumulatedDepreciationCents(
  client: PoolClient,
  assetId: string,
  beforePeriod: string
): Promise<number> {
  const result = await client.query<{ total: string | null }>(
    `select sum(amount)::text as total from fixed_asset_depreciations
     where asset_id = $1 and period < $2`,
    [assetId, beforePeriod]
  );
  return toCents(result.rows[0]?.total);
}

/** 某资产的累计折旧额（全部期间），处置时结转累计折旧用。单位分。 */
export async function totalDepreciationCents(
  client: PoolClient,
  assetId: string
): Promise<number> {
  const result = await client.query<{ total: string | null }>(
    `select sum(amount)::text as total from fixed_asset_depreciations where asset_id = $1`,
    [assetId]
  );
  return toCents(result.rows[0]?.total);
}
