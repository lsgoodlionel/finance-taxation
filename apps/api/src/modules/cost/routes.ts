/**
 * 生产成本的 HTTP 接线（V14-C）。
 *
 * - `GET  /api/products`                产品档案
 * - `PUT  /api/products`                新建或更新产品
 * - `GET  /api/production-runs`         生产批次（可按期间、产品过滤）
 * - `PUT  /api/production-runs`         新建或更新批次与料工费归集
 * - `GET  /api/production-runs/:id/preview`   结转预演（不落库）
 * - `POST /api/production-runs/:id/carry-over` 完工结转，生成凭证草稿
 */

import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { writeAudit } from "../../services/audit.js";
import { TOTAL_BASIS_POINTS, type CostElement } from "./equivalent-units.js";
import {
  carryOver,
  getRun,
  listProducts,
  listRuns,
  previewAllocation,
  upsertProduct,
  upsertRun,
  type CostFailureCode
} from "./store.js";

const STATUS_BY_FAILURE: Record<CostFailureCode, number> = {
  PRODUCT_NOT_FOUND: 404,
  RUN_NOT_FOUND: 404,
  RUN_ALREADY_CARRIED_OVER: 409,
  RUN_INVALID_TRANSITION: 409,
  RUN_ALLOCATION_FAILED: 400,
  PERIOD_LOCKED: 409,
  ACCOUNT_MISSING: 409
};

const ELEMENTS: readonly CostElement[] = ["material", "labor", "overhead"];

function failJson(res: ServerResponse, failure: { code: CostFailureCode; message: string }): void {
  json(res, STATUS_BY_FAILURE[failure.code], { error: failure.message, code: failure.code });
}

export async function listProductsRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const items = await listProducts(req.auth!.companyId);
  json(res, 200, { items, total: items.length });
}

export async function upsertProductRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (code === "" || name === "") {
    json(res, 400, { error: "产品编码与名称不能为空" });
    return;
  }

  const result = await upsertProduct({
    companyId: req.auth!.companyId,
    id: typeof body.id === "string" && body.id !== "" ? body.id : null,
    code,
    name,
    unit: typeof body.unit === "string" ? body.unit : "台",
    note: typeof body.note === "string" ? body.note : null
  });

  if (!result.ok) {
    failJson(res, result.failure);
    return;
  }
  json(res, 200, { product: result.value });
}

export async function listRunsRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const items = await listRuns(req.auth!.companyId, {
    period: url.searchParams.get("period") ?? undefined,
    productId: url.searchParams.get("productId") ?? undefined
  });
  json(res, 200, { items, total: items.length });
}

export async function upsertRunRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const productId = typeof body.productId === "string" ? body.productId : "";
  const period = typeof body.period === "string" ? body.period : "";

  if (productId === "" || !/^\d{4}-\d{2}$/.test(period)) {
    json(res, 400, { error: "productId 不能为空，period 必须是 YYYY-MM" });
    return;
  }

  const rawCosts = Array.isArray(body.costs) ? body.costs : [];
  const costs = rawCosts
    .map((raw) => (raw ?? {}) as Record<string, unknown>)
    .filter((cost) => ELEMENTS.includes(cost.element as CostElement))
    .map((cost) => ({
      element: cost.element as CostElement,
      incurredCents: Number.isInteger(Number(cost.incurredCents)) ? Number(cost.incurredCents) : 0,
      // 默认 10000：材料开工即全部投入是最常见的情形，而漏填时按
      // 100% 算至少方向是对的——按 0 算会把全部成本推给完工产品。
      wipCompletionBp: Number.isInteger(Number(cost.wipCompletionBp))
        ? Number(cost.wipCompletionBp)
        : TOTAL_BASIS_POINTS
    }));

  if (costs.length === 0) {
    json(res, 400, { error: "至少要有一个成本项（material / labor / overhead）" });
    return;
  }

  const result = await upsertRun({
    companyId: req.auth!.companyId,
    id: typeof body.id === "string" && body.id !== "" ? body.id : null,
    productId,
    period,
    finishedQuantity: Number(body.finishedQuantity) || 0,
    endingWipQuantity: Number(body.endingWipQuantity) || 0,
    note: typeof body.note === "string" ? body.note : null,
    costs
  });

  if (!result.ok) {
    failJson(res, result.failure);
    return;
  }
  json(res, 200, { run: result.value });
}

/**
 * 结转预演。
 *
 * 与实际结转走同一个纯函数——预览的数字与最终落账的数字必然一致。
 * 分两套实现是「预览说 80 万、实际结转 88 万」的来源。
 */
export async function previewRunRoute(
  req: ApiRequest,
  res: ServerResponse,
  id: string
): Promise<void> {
  const run = await getRun(req.auth!.companyId, id);
  if (!run) {
    json(res, 404, { error: "批次不存在", code: "RUN_NOT_FOUND" });
    return;
  }

  const result = previewAllocation(run);
  if (!result.ok) {
    failJson(res, result.failure);
    return;
  }
  json(res, 200, { run, allocation: result.value });
}

export async function carryOverRunRoute(
  req: ApiRequest,
  res: ServerResponse,
  id: string
): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const run = await getRun(req.auth!.companyId, id);
  if (!run) {
    json(res, 404, { error: "批次不存在", code: "RUN_NOT_FOUND" });
    return;
  }

  // 记账日期缺省用期末——成本结转是期末动作，落在期中会让当月的
  // 库存商品在时点报表上早出现几天。
  const accountingDate =
    typeof body.accountingDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.accountingDate)
      ? body.accountingDate
      : lastDayOfPeriod(run.period);

  const result = await carryOver(req.auth!.companyId, id, accountingDate);
  if (!result.ok) {
    failJson(res, result.failure);
    return;
  }

  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    action: "production.carry_over",
    resourceType: "production_run",
    resourceId: id,
    resourceLabel: `${result.value.run.productName} ${result.value.run.period} 完工结转`,
    changes: {
      voucherId: result.value.voucherId,
      finishedCents: result.value.totalFinishedCents,
      endingWipCents: result.value.totalEndingWipCents
    }
  });

  json(res, 200, result.value);
}

/** 期间最后一天。用 UTC 构造避免时区把日期推到上个月。 */
function lastDayOfPeriod(period: string): string {
  const [year, month] = period.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month!, 0));
  return date.toISOString().slice(0, 10);
}
