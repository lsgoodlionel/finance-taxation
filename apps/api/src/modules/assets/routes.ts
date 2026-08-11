/**
 * 固定资产的 HTTP 接线（V12-C1）。
 *
 * - `GET  /api/assets`                      台账列表
 * - `POST /api/assets`                      建卡
 * - `GET  /api/assets/depreciation?period=` 折旧预览（不落库）
 * - `POST /api/assets/depreciation`         计提折旧，生成草稿凭证
 * - `POST /api/assets/:id/dispose`          处置，生成草稿凭证
 *
 * 预览与计提分开两个动作，是因为折旧一旦计提就会被唯一索引挡住重复执行，
 * 而用户在按下之前有权先看清"这个月要提多少、哪些资产没提、为什么"。
 */

import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { withTransaction } from "../../db/client.js";
import { json } from "../../utils/http.js";
import { fromCents } from "../../utils/money.js";
import { writeAudit } from "../../services/audit.js";
import { createFixedAsset, listFixedAssets } from "./asset-store.js";
import { computeDepreciation, runDepreciation } from "./depreciation-run.js";
import { disposeAsset } from "./disposal.js";

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function listAssetsRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const statusParam = url.searchParams.get("status");
  const status =
    statusParam === "in_use" || statusParam === "disposed" ? statusParam : undefined;

  const items = await withTransaction((client) =>
    listFixedAssets(client, req.auth!.companyId, { status })
  );
  json(res, 200, { items, total: items.length });
}

export async function createAssetRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const assetNo = typeof body.assetNo === "string" ? body.assetNo.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const acquiredOn = typeof body.acquiredOn === "string" ? body.acquiredOn.trim() : "";
  const expenseAccountCode =
    typeof body.expenseAccountCode === "string" ? body.expenseAccountCode.trim() : "";

  if (!assetNo || !name || !acquiredOn || !expenseAccountCode) {
    json(res, 400, {
      error: "assetNo、name、acquiredOn、expenseAccountCode 均必填",
      code: "ASSET_FIELDS_REQUIRED"
    });
    return;
  }

  const usefulLifeMonths = Number(body.usefulLifeMonths);
  if (!Number.isInteger(usefulLifeMonths)) {
    json(res, 400, { error: "usefulLifeMonths 必须是整数月数", code: "ASSET_LIFE_INVALID" });
    return;
  }

  const result = await withTransaction((client) =>
    createFixedAsset(client, {
      companyId: req.auth!.companyId,
      assetNo,
      name,
      category: typeof body.category === "string" ? body.category : undefined,
      acquiredOn,
      originalCost: String(body.originalCost ?? ""),
      salvageValue: body.salvageValue == null ? 0 : String(body.salvageValue),
      usefulLifeMonths,
      expenseAccountCode,
      assetAccountCode:
        typeof body.assetAccountCode === "string" ? body.assetAccountCode : undefined,
      accumulatedAccountCode:
        typeof body.accumulatedAccountCode === "string" ? body.accumulatedAccountCode : undefined,
      depreciationStartPeriod:
        typeof body.depreciationStartPeriod === "string" ? body.depreciationStartPeriod : undefined
    })
  );

  if (!result.ok) {
    json(res, 400, { error: result.failure.message, code: result.failure.code });
    return;
  }

  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    action: "asset.create",
    resourceType: "fixed_asset",
    resourceId: result.asset.id,
    resourceLabel: `${result.asset.assetNo} ${result.asset.name}`,
    changes: { originalCost: result.asset.originalCost, usefulLifeMonths: result.asset.usefulLifeMonths }
  });

  json(res, 201, result.asset);
}

/** 折旧预览：算给用户看，不落库、不生成凭证。 */
export async function previewDepreciationRoute(
  req: ApiRequest,
  res: ServerResponse
): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const period = url.searchParams.get("period") ?? "";
  if (!PERIOD_PATTERN.test(period)) {
    json(res, 400, { error: "period 必填，格式 YYYY-MM", code: "PERIOD_INVALID" });
    return;
  }

  const computed = await withTransaction((client) =>
    computeDepreciation(client, req.auth!.companyId, period)
  );

  const totalCents = computed.reduce((sum, line) => sum + line.amountCents, 0);
  json(res, 200, {
    period,
    totalAmount: fromCents(totalCents),
    items: computed.map((line) => ({
      assetId: line.asset.id,
      assetNo: line.asset.assetNo,
      assetName: line.asset.name,
      amount: fromCents(line.amountCents),
      reason: line.reason,
      expenseAccountCode: line.asset.expenseAccountCode
    }))
  });
}

export async function runDepreciationRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const period = typeof body.period === "string" ? body.period.trim() : "";
  if (!PERIOD_PATTERN.test(period)) {
    json(res, 400, { error: "period 必填，格式 YYYY-MM", code: "PERIOD_INVALID" });
    return;
  }

  const result = await withTransaction((client) =>
    runDepreciation(client, {
      companyId: req.auth!.companyId,
      period,
      now: new Date().toISOString(),
      createdBy: req.auth!.userId
    })
  );

  if (!result.ok) {
    // 期间锁与重复计提是「状态冲突」而非「入参有误」，回 409 让前端能区分：
    // 400 提示用户改输入，409 提示用户先解锁 / 先红冲原凭证。
    const conflict =
      result.failure.code === "PERIOD_LOCKED" ||
      result.failure.code === "DEPRECIATION_ALREADY_RUN";
    json(res, conflict ? 409 : 400, { error: result.failure.message, ...result.failure });
    return;
  }

  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    action: "asset.depreciation.run",
    resourceType: "voucher",
    resourceId: result.summary.voucherId,
    resourceLabel: `计提折旧 ${period}`,
    changes: { totalAmount: result.summary.totalAmount, assetCount: result.summary.details.length }
  });

  json(res, 201, result.summary);
}

export async function disposeAssetRoute(
  req: ApiRequest,
  res: ServerResponse,
  assetId: string
): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const disposedOn = typeof body.disposedOn === "string" ? body.disposedOn.trim() : "";
  if (!disposedOn) {
    json(res, 400, { error: "disposedOn 必填，格式 YYYY-MM-DD", code: "DISPOSAL_DATE_INVALID" });
    return;
  }

  const result = await withTransaction((client) =>
    disposeAsset(client, {
      companyId: req.auth!.companyId,
      assetId,
      disposedOn,
      proceeds: body.proceeds == null ? null : String(body.proceeds),
      proceedsAccountCode:
        typeof body.proceedsAccountCode === "string" ? body.proceedsAccountCode : null,
      now: new Date().toISOString()
    })
  );

  if (!result.ok) {
    const status =
      result.failure.code === "ASSET_NOT_FOUND"
        ? 404
        : result.failure.code === "ASSET_ALREADY_DISPOSED" ||
            result.failure.code === "PERIOD_LOCKED" ||
            result.failure.code === "DEPRECIATION_PENDING"
          ? 409
          : 400;
    json(res, status, { error: result.failure.message, ...result.failure });
    return;
  }

  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    action: "asset.dispose",
    resourceType: "fixed_asset",
    resourceId: assetId,
    resourceLabel: `处置 ${assetId}`,
    changes: {
      disposedOn,
      voucherId: result.summary.voucherId,
      netBookValue: result.summary.netBookValue,
      gain: result.summary.gain
    }
  });

  json(res, 201, result.summary);
}
