/**
 * 税率主数据的 HTTP 接线（V12-D2）。
 *
 * - `GET  /api/tax/rates?taxType=&on=` 税率列表；带 `on` 时只返回该日生效的
 * - `POST /api/tax/rates`              新增公司自定义税率
 * - `POST /api/tax/rates/:id/expire`   给自定义税率封口
 */

import type { ServerResponse } from "node:http";
import type { ApiRequest } from "../../types.js";
import { json } from "../../utils/http.js";
import { writeAudit } from "../../services/audit.js";
import { createTaxRate, expireTaxRate, listTaxRates } from "./tax-rate-store.js";
import { describeRate, effectiveRateOf, listEffectiveRates, type TaxRate } from "./tax-rate.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function serialize(rate: TaxRate) {
  return {
    id: rate.id,
    companyId: rate.companyId,
    taxType: rate.taxType,
    code: rate.code,
    name: rate.name,
    rate: rate.rate,
    levyRate: rate.levyRate,
    /** 算税实际该用的比例——调用方不必自己判断有没有减征。 */
    effectiveRate: effectiveRateOf(rate),
    description: describeRate(rate),
    taxpayerType: rate.taxpayerType,
    applicableScope: rate.applicableScope,
    effectiveFrom: rate.effectiveFrom,
    effectiveTo: rate.effectiveTo,
    isSystem: rate.companyId === null
  };
}

export async function listTaxRatesRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const taxType = url.searchParams.get("taxType");
  const on = url.searchParams.get("on");
  if (on && !DATE_PATTERN.test(on)) {
    json(res, 400, { error: "on 必须形如 YYYY-MM-DD", code: "TAX_RATE_DATE_INVALID" });
    return;
  }

  const all = await listTaxRates(req.auth!.companyId, taxType ?? undefined);
  // 带 on 时只给该日生效的那几档——税率选择器不该把 2018 年的 16% 列出来。
  // 不带 on 时给全量，含历史档：重算旧期间的底稿要用。
  const items = on && taxType ? listEffectiveRates(all, taxType, on) : all;

  json(res, 200, { items: items.map(serialize), total: items.length, on: on ?? null });
}

export async function createTaxRateRoute(req: ApiRequest, res: ServerResponse): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const result = await createTaxRate({
    companyId: req.auth!.companyId,
    taxType: typeof body.taxType === "string" ? body.taxType : "",
    code: typeof body.code === "string" ? body.code : "",
    name: typeof body.name === "string" ? body.name : "",
    rate: Number(body.rate),
    levyRate: body.levyRate == null ? null : Number(body.levyRate),
    taxpayerType:
      body.taxpayerType === "general_vat" ||
      body.taxpayerType === "small_scale" ||
      body.taxpayerType === "general_simplified"
        ? body.taxpayerType
        : null,
    applicableScope: typeof body.applicableScope === "string" ? body.applicableScope : "",
    effectiveFrom: typeof body.effectiveFrom === "string" ? body.effectiveFrom.trim() : "",
    effectiveTo: typeof body.effectiveTo === "string" ? body.effectiveTo.trim() : null,
    sortOrder: Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : undefined
  });

  if (!result.ok) {
    json(res, result.failure.code === "TAX_RATE_OVERLAPS" ? 409 : 400, {
      error: result.failure.message,
      code: result.failure.code
    });
    return;
  }

  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    action: "tax.rate.create",
    resourceType: "tax_rate",
    resourceId: result.rate.id,
    resourceLabel: `${result.rate.code} ${describeRate(result.rate)}`,
    changes: {
      rate: result.rate.rate,
      levyRate: result.rate.levyRate,
      effectiveFrom: result.rate.effectiveFrom
    }
  });

  json(res, 201, serialize(result.rate));
}

export async function expireTaxRateRoute(
  req: ApiRequest,
  res: ServerResponse,
  rateId: string
): Promise<void> {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const effectiveTo = typeof body.effectiveTo === "string" ? body.effectiveTo.trim() : "";
  if (!DATE_PATTERN.test(effectiveTo)) {
    json(res, 400, { error: "effectiveTo 必填，格式 YYYY-MM-DD", code: "TAX_RATE_DATE_INVALID" });
    return;
  }

  const updated = await expireTaxRate(req.auth!.companyId, rateId, effectiveTo);
  if (!updated) {
    json(res, 404, {
      // 系统内置税率的沿革由迁移维护，不接受运行期修改——它是全租户共享的
      error: `找不到可封口的自定义税率 ${rateId}（系统内置税率不可修改，失效日也不能早于生效日）`,
      code: "TAX_RATE_NOT_FOUND"
    });
    return;
  }

  writeAudit({
    companyId: req.auth!.companyId,
    userId: req.auth!.userId,
    action: "tax.rate.expire",
    resourceType: "tax_rate",
    resourceId: rateId,
    resourceLabel: `封口 ${rateId}`,
    changes: { effectiveTo }
  });

  json(res, 200, { id: rateId, effectiveTo });
}
