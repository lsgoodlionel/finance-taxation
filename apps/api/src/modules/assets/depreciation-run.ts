/**
 * 按期计提折旧（V12-C1）。
 *
 * ## 产出的是草稿凭证，不是直接过账
 *
 * 折旧是常规业务凭证，不是期末结转。期初建账和期末结转由系统直接过账，是因为
 * 它们的金额完全由账面数据决定、没有人工判断空间；折旧不同 —— 资产是否已闲置、
 * 费用该进管理费用还是制造费用，都是人的判断。系统生成草稿、人审核过账，
 * 与红冲同一套路径，也保住了职责分离（系统不能既生成又过账）。
 *
 * 因此本模块**不写 ledger_entries**，也就不需要碰 ledger-writer 的 source 联合类型。
 * 折旧金额进总账的那一刻，走的是和手工凭证完全相同的 `postVoucher`。
 *
 * ## 重复计提在两层被堵住
 *
 * 月结跑两遍导致费用翻倍是折旧最经典的事故。两道闸：
 * 1. 本模块开头查本期是否已有计提明细，有就拒绝（给出可读的原因）；
 * 2. `uq_fixed_asset_depreciations_asset_period` 唯一索引 —— 并发下两个请求
 *    同时通过第 1 道闸时，数据库仍会挡下后一个。
 * 只有第 1 道会漏，只有第 2 道则报错难懂。
 */

import type { PoolClient } from "pg";
import { checkAccountsUsable } from "../accounts/account-guard.js";
import { fromCents } from "../../utils/money.js";
import {
  accumulatedDepreciationCents,
  listDepreciableAssets,
  toDepreciableAsset,
  type FixedAsset
} from "./asset-store.js";
import { depreciationForPeriod, type DepreciationReason } from "./depreciation.js";

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** 期间最后一天，作为折旧凭证的会计日期。 */
export function endOfPeriod(period: string): string {
  const year = Number(period.slice(0, 4));
  const month = Number(period.slice(5, 7));
  // Date.UTC 的 day=0 取的是上一个月的最后一天，故传 month（1-based）本身
  const last = new Date(Date.UTC(year, month, 0));
  return last.toISOString().slice(0, 10);
}

export interface DepreciationLineDetail {
  assetId: string;
  assetNo: string;
  assetName: string;
  amount: string;
  reason: DepreciationReason;
  expenseAccountCode: string;
  accumulatedAccountCode: string;
}

export interface DepreciationRunSummary {
  period: string;
  voucherId: string;
  accountingDate: string;
  totalAmount: string;
  /** 本期实际计提的资产（金额 > 0）。 */
  details: DepreciationLineDetail[];
  /** 在计提范围内但本期金额为 0 的资产及原因，用于回答"为什么这台设备没提"。 */
  skipped: { assetId: string; assetNo: string; reason: DepreciationReason }[];
}

export type DepreciationRunFailure = {
  code:
    | "PERIOD_INVALID"
    | "PERIOD_LOCKED"
    | "DEPRECIATION_ALREADY_RUN"
    | "NO_DEPRECIABLE_ASSET"
    | "ACCOUNT_NOT_FOUND"
    | "ACCOUNT_NOT_LEAF"
    | "ACCOUNT_INACTIVE";
  message: string;
  offendingCodes?: string[];
};

export type DepreciationRunResult =
  | { ok: true; summary: DepreciationRunSummary }
  | { ok: false; failure: DepreciationRunFailure };

export interface RunDepreciationInput {
  companyId: string;
  period: string;
  /** ISO 时间戳，注入以保证测试确定性。 */
  now: string;
  createdBy?: string | null;
}

interface ComputedLine {
  asset: FixedAsset;
  amountCents: number;
  reason: DepreciationReason;
}

/**
 * 计算本期各资产应提折旧额。不写库，便于单测与"预览再确认"的交互。
 */
export async function computeDepreciation(
  client: PoolClient,
  companyId: string,
  period: string
): Promise<ComputedLine[]> {
  const assets = await listDepreciableAssets(client, companyId, period);
  const lines: ComputedLine[] = [];
  for (const asset of assets) {
    const accumulated = await accumulatedDepreciationCents(client, asset.id, period);
    const outcome = depreciationForPeriod(toDepreciableAsset(asset), period, accumulated);
    lines.push({ asset, amountCents: outcome.amountCents, reason: outcome.reason });
  }
  return lines;
}

export async function runDepreciation(
  client: PoolClient,
  input: RunDepreciationInput
): Promise<DepreciationRunResult> {
  const { companyId, period, now } = input;

  if (!PERIOD_PATTERN.test(period)) {
    return { ok: false, failure: { code: "PERIOD_INVALID", message: "折旧期间必须形如 YYYY-MM。" } };
  }

  const locked = await client.query<{ is_locked: boolean }>(
    `select is_locked from accounting_periods where company_id = $1 and period = $2`,
    [companyId, period]
  );
  if (locked.rows[0]?.is_locked) {
    return {
      ok: false,
      failure: {
        code: "PERIOD_LOCKED",
        message: `会计期间 ${period} 已锁账，无法计提折旧。请先解锁该期间。`
      }
    };
  }

  const already = await client.query<{ count: string }>(
    `select count(*)::text as count from fixed_asset_depreciations
     where company_id = $1 and period = $2`,
    [companyId, period]
  );
  if (Number(already.rows[0]?.count ?? 0) > 0) {
    return {
      ok: false,
      failure: {
        code: "DEPRECIATION_ALREADY_RUN",
        message:
          `${period} 已计提过折旧。重复计提会让本期费用翻倍，因此被拒绝。` +
          `如需重算，请先红冲原折旧凭证并删除该期计提明细。`
      }
    };
  }

  const computed = await computeDepreciation(client, companyId, period);
  const effective = computed.filter((line) => line.amountCents > 0);
  if (effective.length === 0) {
    return {
      ok: false,
      failure: {
        code: "NO_DEPRECIABLE_ASSET",
        message:
          computed.length === 0
            ? `${period} 没有处于计提区间的固定资产。`
            : `${period} 范围内的 ${computed.length} 项资产本期应提金额均为 0（已提足、尚未起提或已处置）。`
      }
    };
  }

  // 科目闸门：expense_account_code 是建卡时录的，可能指向不存在或已停用的科目。
  // 等到人工过账时才发现，草稿已经躺在待办里污染月结进度了。
  const guardLines = [
    ...new Set(
      effective.flatMap((line) => [
        line.asset.expenseAccountCode,
        line.asset.accumulatedAccountCode
      ])
    )
  ].map((accountCode) => ({ accountCode }));
  const guard = await checkAccountsUsable(companyId, guardLines, client);
  if (!guard.ok) {
    return {
      ok: false,
      failure: { code: guard.code, message: guard.message, offendingCodes: guard.offendingCodes }
    };
  }

  const accountingDate = endOfPeriod(period);
  const voucherId = `vch-dep-${companyId}-${period}`;
  const summaryText = `计提折旧 ${period}`;

  await client.query(
    `insert into vouchers (
       id, company_id, voucher_type, summary, status, source,
       accounting_date, period, created_at, updated_at
     ) values ($1, $2, 'depreciation', $3, 'draft', 'depreciation', $4::date, $5, $6::timestamptz, $6::timestamptz)`,
    [voucherId, companyId, summaryText, accountingDate, period, now]
  );

  // 借方按费用科目汇总、贷方按累计折旧科目汇总 —— 一台设备一行会让制造业
  // 几百台资产撑出一张几百行的凭证，没人看得下去。单资产的明细在
  // fixed_asset_depreciations 里，两边各司其职。
  const debitByAccount = new Map<string, number>();
  const creditByAccount = new Map<string, number>();
  for (const line of effective) {
    const { expenseAccountCode, accumulatedAccountCode } = line.asset;
    debitByAccount.set(
      expenseAccountCode,
      (debitByAccount.get(expenseAccountCode) ?? 0) + line.amountCents
    );
    creditByAccount.set(
      accumulatedAccountCode,
      (creditByAccount.get(accumulatedAccountCode) ?? 0) + line.amountCents
    );
  }

  const accountNames = await loadAccountNames(client, companyId, [
    ...debitByAccount.keys(),
    ...creditByAccount.keys()
  ]);

  const voucherLines = [
    ...[...debitByAccount.entries()].map(([code, cents]) => ({
      accountCode: code,
      debit: fromCents(cents),
      credit: "0.00"
    })),
    ...[...creditByAccount.entries()].map(([code, cents]) => ({
      accountCode: code,
      debit: "0.00",
      credit: fromCents(cents)
    }))
  ];

  for (const [index, line] of voucherLines.entries()) {
    await client.query(
      `insert into voucher_lines (
         id, company_id, voucher_id, summary, account_code, account_name, debit, credit, sort_order
       ) values ($1, $2, $3, $4, $5, $6, $7::numeric, $8::numeric, $9)`,
      [
        `vl-dep-${companyId}-${period}-${index + 1}`,
        companyId,
        voucherId,
        summaryText,
        line.accountCode,
        accountNames.get(line.accountCode) ?? line.accountCode,
        line.debit,
        line.credit,
        index
      ]
    );
  }

  for (const line of effective) {
    await client.query(
      `insert into fixed_asset_depreciations (id, company_id, asset_id, period, amount, voucher_id)
       values ($1, $2, $3, $4, $5::numeric, $6)`,
      [
        `fad-${line.asset.id}-${period}`,
        companyId,
        line.asset.id,
        period,
        fromCents(line.amountCents),
        voucherId
      ]
    );
  }

  const totalCents = effective.reduce((sum, line) => sum + line.amountCents, 0);
  return {
    ok: true,
    summary: {
      period,
      voucherId,
      accountingDate,
      totalAmount: fromCents(totalCents),
      details: effective.map((line) => ({
        assetId: line.asset.id,
        assetNo: line.asset.assetNo,
        assetName: line.asset.name,
        amount: fromCents(line.amountCents),
        reason: line.reason,
        expenseAccountCode: line.asset.expenseAccountCode,
        accumulatedAccountCode: line.asset.accumulatedAccountCode
      })),
      skipped: computed
        .filter((line) => line.amountCents === 0)
        .map((line) => ({
          assetId: line.asset.id,
          assetNo: line.asset.assetNo,
          reason: line.reason
        }))
    }
  };
}

async function loadAccountNames(
  client: PoolClient,
  companyId: string,
  codes: readonly string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(codes)];
  if (unique.length === 0) return new Map();
  const result = await client.query<{ code: string; name: string }>(
    `select code, name from accounts where company_id = $1 and code = any($2::text[])`,
    [companyId, unique]
  );
  return new Map(result.rows.map((row) => [row.code, row.name]));
}
