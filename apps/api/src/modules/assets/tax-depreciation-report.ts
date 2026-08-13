/**
 * 资产折旧纳税调整明细表（V12-D4）。
 *
 * 对应所得税年度纳税申报表 **A105080《资产折旧、摊销及纳税调整明细表》**：
 * 逐项资产列出会计折旧、税法扣除与两者的差额，汇总后是当年的纳税调整额。
 */

import type { PoolClient } from "pg";
import { toCents } from "../../utils/money.js";
import {
  describeAdjustment,
  resolveTaxLife,
  taxDepreciationForYear,
  type TaxDepreciationAsset
} from "./tax-depreciation.js";

export interface TaxDepreciationRow {
  assetId: string;
  assetNo: string;
  assetName: string;
  category: string;
  originalCostCents: number;
  /** 会计折旧年限（月）。 */
  accountingLifeMonths: number;
  /** 税法折旧年限（月），由类别推出。 */
  taxLifeMonths: number;
  accountingDepreciationCents: number;
  taxDeductionCents: number;
  adjustmentCents: number;
  reason: string;
  explanation: string;
}

export interface TaxDepreciationReport {
  taxYear: number;
  /** 全部资产的会计折旧合计。 */
  accountingTotalCents: number;
  /** 全部资产的税法扣除合计。 */
  taxTotalCents: number;
  /** 纳税调整合计：正数调增、负数调减。 */
  adjustmentTotalCents: number;
  rows: TaxDepreciationRow[];
}

interface AssetRow {
  id: string;
  asset_no: string;
  name: string;
  category: string;
  tax_category: string | null;
  original_cost: string;
  salvage_value: string;
  useful_life_months: number;
  acquired_on: string | Date;
  elects_one_time_deduction: boolean;
  /** 本纳税年度的会计折旧额。 */
  year_depreciation: string | null;
  /** 截至上年末的会计折旧累计——用作税法扣除的起点近似值，见下方注释。 */
  prior_depreciation: string | null;
}

function toDateOnly(value: string | Date): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

/**
 * 取某纳税年度的资产折旧数据。
 *
 * ## 税法累计扣除额的取数
 *
 * 严格来说应该逐年重算税法扣除并累加。这里用**截至上年末的会计折旧累计**作为
 * `priorTaxDeductionCents` 的近似 —— 它只影响最后一年的收口（`taxDeductionForYear`
 * 用它来避免超扣），在会计折旧快于税法的常见情形下偏大，收口只会更早而不会超扣。
 *
 * 精确做法是把每年的税法扣除额落库（像 `fixed_asset_depreciations` 那样），
 * 那需要一张税法折旧明细表。**本期不做**：汇算是年度动作，重算一遍的代价可以
 * 接受，而多一张表就多一处要与会计折旧保持一致的状态。这个取舍写在这里，
 * 将来若要支持"锁定往年汇算结果"再补表。
 */
export async function loadTaxDepreciationRows(
  client: PoolClient,
  companyId: string,
  taxYear: number
): Promise<TaxDepreciationReport> {
  const yearStart = `${taxYear}-01-01`;
  const yearEnd = `${taxYear}-12-31`;

  const result = await client.query<AssetRow>(
    `select a.id, a.asset_no, a.name, a.category, a.tax_category,
            a.original_cost::text, a.salvage_value::text, a.useful_life_months,
            a.acquired_on, a.elects_one_time_deduction,
            (select sum(d.amount)::text from fixed_asset_depreciations d
              where d.asset_id = a.id and d.period >= $2 and d.period <= $3) as year_depreciation,
            (select sum(d.amount)::text from fixed_asset_depreciations d
              where d.asset_id = a.id and d.period < $2) as prior_depreciation
     from fixed_assets a
     where a.company_id = $1
       and a.acquired_on <= $4::date
     order by a.asset_no`,
    [companyId, `${taxYear}-01`, `${taxYear}-12`, yearEnd]
  );

  const rows: TaxDepreciationRow[] = [];
  let accountingTotalCents = 0;
  let taxTotalCents = 0;
  let adjustmentTotalCents = 0;

  for (const row of result.rows) {
    const asset: TaxDepreciationAsset = {
      // 税法分类优先，留空回落到会计分类
      category: row.tax_category ?? row.category,
      originalCostCents: toCents(row.original_cost),
      salvageValueCents: toCents(row.salvage_value),
      accountingLifeMonths: row.useful_life_months,
      acquiredOn: toDateOnly(row.acquired_on),
      electsOneTimeDeduction: row.elects_one_time_deduction
    };

    const outcome = taxDepreciationForYear({
      asset,
      accountingDepreciationCents: toCents(row.year_depreciation),
      taxYear,
      priorTaxDeductionCents: toCents(row.prior_depreciation)
    });

    accountingTotalCents += outcome.accountingDepreciationCents;
    taxTotalCents += outcome.taxDeductionCents;
    adjustmentTotalCents += outcome.adjustmentCents;

    rows.push({
      assetId: row.id,
      assetNo: row.asset_no,
      assetName: row.name,
      category: asset.category,
      originalCostCents: asset.originalCostCents,
      accountingLifeMonths: asset.accountingLifeMonths,
      taxLifeMonths: resolveTaxLife(asset).taxLifeMonths,
      accountingDepreciationCents: outcome.accountingDepreciationCents,
      taxDeductionCents: outcome.taxDeductionCents,
      adjustmentCents: outcome.adjustmentCents,
      reason: outcome.reason,
      explanation: describeAdjustment(outcome)
    });
  }

  return {
    taxYear,
    accountingTotalCents,
    taxTotalCents,
    adjustmentTotalCents,
    rows
  };
}

/** 汇算底稿上的一句话结论。 */
export function describeReport(report: TaxDepreciationReport): string {
  if (report.rows.length === 0) {
    return `${report.taxYear} 年没有需要计提折旧的固定资产。`;
  }
  const amount = (Math.abs(report.adjustmentTotalCents) / 100).toFixed(2);
  if (report.adjustmentTotalCents === 0) {
    return `${report.taxYear} 年会计折旧与税法口径一致，无需纳税调整。`;
  }
  return report.adjustmentTotalCents > 0
    ? `${report.taxYear} 年折旧纳税调增 ${amount}——会计折旧快于税法允许的扣除进度。`
    : `${report.taxYear} 年折旧纳税调减 ${amount}——税法允许的扣除快于会计折旧（多为一次性扣除）。`;
}
