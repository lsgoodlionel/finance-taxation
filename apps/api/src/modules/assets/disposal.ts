/**
 * 固定资产处置（V12-C1）。
 *
 * ## 分录形态
 *
 * 资产离开账面要做三件事：销掉原值、销掉已提的累计折旧、把净值与处置价款的
 * 差额认成损益。载体是「固定资产清理」1606：
 *
 *     借 累计折旧 1602        已提累计折旧
 *     借 固定资产清理 1606    净值（原值 − 累计折旧）
 *     贷 固定资产 1601        原值
 *
 * 若本次同时收到处置价款，再把 1606 结平并认损益：
 *
 *     借 银行存款等           处置价款
 *     贷 固定资产清理 1606    处置价款
 *     借/贷 资产处置损益 6115  差额
 *
 * 不传价款时 1606 保留借方余额挂账 —— 这正是 1606 存在的意义：本月报废、
 * 次月才收到残值变卖款是常态，净值必须先有个落脚点。把两步压成一步、跳过
 * 1606，跨期处置就无处安放。
 *
 * ## 处置前必须先计提当月折旧
 *
 * 中国准则「当月减少的固定资产当月照提折旧」意味着处置当月的折旧是这个资产
 * 最后一笔费用。若在计提之前先处置，累计折旧数就少了一个月，净值虚高，
 * 处置损益跟着错。所以本模块在算账前先检查这一点，**拒绝**而不是替用户补提
 * —— 补提要生成折旧凭证，那是 {@link runDepreciation} 的职责，两个模块各写一遍
 * 就会漂移。
 */

import type { PoolClient } from "pg";
import { checkAccountsUsable } from "../accounts/account-guard.js";
import { fromCents, toCents } from "../../utils/money.js";
import {
  findFixedAsset,
  toDepreciableAsset,
  totalDepreciationCents,
  accumulatedDepreciationCents,
  type FixedAsset
} from "./asset-store.js";
import { depreciationForPeriod } from "./depreciation.js";
import { endOfPeriod } from "./depreciation-run.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** 固定资产清理与资产处置损益的科目码，随迁移 062 一同引入。 */
export const CLEARING_ACCOUNT_CODE = "1606";
export const DISPOSAL_GAIN_ACCOUNT_CODE = "6115";

export interface DisposeAssetInput {
  companyId: string;
  assetId: string;
  /** 处置日期 `YYYY-MM-DD`。所属期间由它推出。 */
  disposedOn: string;
  /** 处置价款；不传表示价款未定/未收到，净值先挂 1606。 */
  proceeds?: string | number | null;
  /** 收到价款的科目（银行存款 1002、其他应收款 1221 等）。传了 proceeds 就必须传它。 */
  proceedsAccountCode?: string | null;
  /** ISO 时间戳，注入以保证测试确定性。 */
  now: string;
}

export interface DisposalSummary {
  assetId: string;
  voucherId: string;
  disposedOn: string;
  period: string;
  originalCost: string;
  accumulatedDepreciation: string;
  netBookValue: string;
  proceeds: string;
  /** 处置损益：正数为收益，负数为损失。未结算价款时为 null。 */
  gain: string | null;
  lines: { accountCode: string; accountName: string; debit: string; credit: string }[];
}

export type DisposalFailure = {
  code:
    | "ASSET_NOT_FOUND"
    | "ASSET_ALREADY_DISPOSED"
    | "DISPOSAL_DATE_INVALID"
    | "DISPOSAL_BEFORE_ACQUISITION"
    | "PERIOD_LOCKED"
    | "DEPRECIATION_PENDING"
    | "PROCEEDS_ACCOUNT_REQUIRED"
    | "PROCEEDS_INVALID"
    | "ACCOUNT_NOT_FOUND"
    | "ACCOUNT_NOT_LEAF"
    | "ACCOUNT_INACTIVE";
  message: string;
  offendingCodes?: string[];
};

export type DisposeAssetResult =
  | { ok: true; summary: DisposalSummary }
  | { ok: false; failure: DisposalFailure };

interface DraftLine {
  accountCode: string;
  debitCents: number;
  creditCents: number;
}

/**
 * 处置分录（纯函数）。金额全部按分计算，凭证行由调用方补科目名。
 *
 * 抽成纯函数是因为分录方向是这块最容易写反的地方，而它不需要数据库就能钉住。
 */
export function buildDisposalLines(params: {
  assetAccountCode: string;
  accumulatedAccountCode: string;
  originalCostCents: number;
  accumulatedCents: number;
  proceedsCents: number | null;
  proceedsAccountCode: string | null;
}): DraftLine[] {
  const {
    assetAccountCode,
    accumulatedAccountCode,
    originalCostCents,
    accumulatedCents,
    proceedsCents,
    proceedsAccountCode
  } = params;

  const netBookValue = originalCostCents - accumulatedCents;
  const lines: DraftLine[] = [];

  if (accumulatedCents > 0) {
    lines.push({ accountCode: accumulatedAccountCode, debitCents: accumulatedCents, creditCents: 0 });
  }
  if (netBookValue !== 0) {
    // 净值为负（累计折旧超过原值）在有约束的前提下不该出现，但真出现时
    // 如实记成 1606 的贷方，而不是取绝对值假装正常。
    lines.push(
      netBookValue > 0
        ? { accountCode: CLEARING_ACCOUNT_CODE, debitCents: netBookValue, creditCents: 0 }
        : { accountCode: CLEARING_ACCOUNT_CODE, debitCents: 0, creditCents: -netBookValue }
    );
  }
  lines.push({ accountCode: assetAccountCode, debitCents: 0, creditCents: originalCostCents });

  if (proceedsCents === null) {
    return lines;
  }

  if (proceedsCents > 0 && proceedsAccountCode) {
    lines.push({ accountCode: proceedsAccountCode, debitCents: proceedsCents, creditCents: 0 });
    lines.push({ accountCode: CLEARING_ACCOUNT_CODE, debitCents: 0, creditCents: proceedsCents });
  }

  const gain = proceedsCents - netBookValue;
  if (gain > 0) {
    lines.push({ accountCode: CLEARING_ACCOUNT_CODE, debitCents: gain, creditCents: 0 });
    lines.push({ accountCode: DISPOSAL_GAIN_ACCOUNT_CODE, debitCents: 0, creditCents: gain });
  } else if (gain < 0) {
    lines.push({ accountCode: DISPOSAL_GAIN_ACCOUNT_CODE, debitCents: -gain, creditCents: 0 });
    lines.push({ accountCode: CLEARING_ACCOUNT_CODE, debitCents: 0, creditCents: -gain });
  }

  return lines;
}

/** 处置当期的折旧是否还欠着。欠着就不能处置——累计折旧不全，净值和损益都会错。 */
async function pendingDepreciation(
  client: PoolClient,
  asset: FixedAsset,
  period: string
): Promise<boolean> {
  const accumulated = await accumulatedDepreciationCents(client, asset.id, period);
  // 用处置后的形状判定：处置当月仍应计提
  const outcome = depreciationForPeriod(
    { ...toDepreciableAsset(asset), disposedPeriod: period },
    period,
    accumulated
  );
  if (outcome.amountCents === 0) return false;

  const existing = await client.query(
    `select 1 from fixed_asset_depreciations where asset_id = $1 and period = $2`,
    [asset.id, period]
  );
  return existing.rowCount === 0;
}

export async function disposeAsset(
  client: PoolClient,
  input: DisposeAssetInput
): Promise<DisposeAssetResult> {
  const { companyId, assetId, disposedOn, now } = input;

  if (!DATE_PATTERN.test(disposedOn)) {
    return {
      ok: false,
      failure: { code: "DISPOSAL_DATE_INVALID", message: "处置日期必须形如 YYYY-MM-DD。" }
    };
  }

  const asset = await findFixedAsset(client, companyId, assetId);
  if (!asset) {
    return { ok: false, failure: { code: "ASSET_NOT_FOUND", message: `找不到资产 ${assetId}。` } };
  }
  if (asset.status === "disposed") {
    return {
      ok: false,
      failure: {
        code: "ASSET_ALREADY_DISPOSED",
        message: `资产 ${asset.assetNo} 已于 ${asset.disposedOn} 处置，不能重复处置。`
      }
    };
  }
  if (disposedOn < asset.acquiredOn) {
    return {
      ok: false,
      failure: {
        code: "DISPOSAL_BEFORE_ACQUISITION",
        message: `处置日期 ${disposedOn} 早于购置日期 ${asset.acquiredOn}。`
      }
    };
  }

  const period = disposedOn.slice(0, 7);
  const locked = await client.query<{ is_locked: boolean }>(
    `select is_locked from accounting_periods where company_id = $1 and period = $2`,
    [companyId, period]
  );
  if (locked.rows[0]?.is_locked) {
    return {
      ok: false,
      failure: { code: "PERIOD_LOCKED", message: `会计期间 ${period} 已锁账，无法处置资产。` }
    };
  }

  if (await pendingDepreciation(client, asset, period)) {
    return {
      ok: false,
      failure: {
        code: "DEPRECIATION_PENDING",
        message:
          `资产 ${asset.assetNo} 在 ${period} 还有未计提的折旧。` +
          `按准则「当月减少的固定资产当月照提折旧」，请先完成 ${period} 的折旧计提再处置，` +
          `否则累计折旧少提一个月，处置损益会算错。`
      }
    };
  }

  const hasProceeds = input.proceeds !== undefined && input.proceeds !== null;
  if (hasProceeds && !input.proceedsAccountCode) {
    return {
      ok: false,
      failure: {
        code: "PROCEEDS_ACCOUNT_REQUIRED",
        message: "填写了处置价款就必须指定收款科目（如 1002 银行存款）。"
      }
    };
  }
  const proceedsCents = hasProceeds ? toCents(input.proceeds) : null;
  if (proceedsCents !== null && (!Number.isFinite(proceedsCents) || proceedsCents < 0)) {
    return { ok: false, failure: { code: "PROCEEDS_INVALID", message: "处置价款不能为负数。" } };
  }

  const accumulatedCents = await totalDepreciationCents(client, asset.id);
  const originalCostCents = toCents(asset.originalCost);
  const lines = buildDisposalLines({
    assetAccountCode: asset.assetAccountCode,
    accumulatedAccountCode: asset.accumulatedAccountCode,
    originalCostCents,
    accumulatedCents,
    proceedsCents,
    proceedsAccountCode: input.proceedsAccountCode ?? null
  });

  const guard = await checkAccountsUsable(
    companyId,
    [...new Set(lines.map((line) => line.accountCode))].map((accountCode) => ({ accountCode })),
    client
  );
  if (!guard.ok) {
    return {
      ok: false,
      failure: { code: guard.code, message: guard.message, offendingCodes: guard.offendingCodes }
    };
  }

  const accountNames = await loadAccountNames(
    client,
    companyId,
    lines.map((line) => line.accountCode)
  );

  const voucherId = `vch-disposal-${asset.id}`;
  const summaryText = `处置固定资产 ${asset.assetNo} ${asset.name}`;
  // 会计日期取处置日期本身，而非期间末日——处置是有确切发生日的业务事件，
  // 不像折旧那样是整期摊派。
  await client.query(
    `insert into vouchers (
       id, company_id, voucher_type, summary, status, source,
       accounting_date, period, created_at, updated_at
     ) values ($1, $2, 'disposal', $3, 'draft', 'asset_disposal', $4::date, $5, $6::timestamptz, $6::timestamptz)`,
    [voucherId, companyId, summaryText, disposedOn, period, now]
  );

  for (const [index, line] of lines.entries()) {
    await client.query(
      `insert into voucher_lines (
         id, company_id, voucher_id, summary, account_code, account_name, debit, credit, sort_order
       ) values ($1, $2, $3, $4, $5, $6, $7::numeric, $8::numeric, $9)`,
      [
        `vl-disposal-${asset.id}-${index + 1}`,
        companyId,
        voucherId,
        summaryText,
        line.accountCode,
        accountNames.get(line.accountCode) ?? line.accountCode,
        fromCents(line.debitCents),
        fromCents(line.creditCents),
        index
      ]
    );
  }

  await client.query(
    `update fixed_assets
     set status = 'disposed', disposed_on = $2::date, disposed_period = $3, updated_at = now()
     where id = $1`,
    [asset.id, disposedOn, period]
  );

  const netBookValue = originalCostCents - accumulatedCents;
  return {
    ok: true,
    summary: {
      assetId: asset.id,
      voucherId,
      disposedOn,
      period,
      originalCost: fromCents(originalCostCents),
      accumulatedDepreciation: fromCents(accumulatedCents),
      netBookValue: fromCents(netBookValue),
      proceeds: fromCents(proceedsCents ?? 0),
      gain: proceedsCents === null ? null : fromCents(proceedsCents - netBookValue),
      lines: lines.map((line) => ({
        accountCode: line.accountCode,
        accountName: accountNames.get(line.accountCode) ?? line.accountCode,
        debit: fromCents(line.debitCents),
        credit: fromCents(line.creditCents)
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
