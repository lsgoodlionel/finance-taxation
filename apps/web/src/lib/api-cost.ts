/**
 * 生产成本结转的前端接口（V14-C）。
 */

import { request } from "./api";

export type CostElement = "material" | "labor" | "overhead";

export const COST_ELEMENT_LABELS: Record<CostElement, string> = {
  material: "直接材料",
  labor: "直接人工",
  overhead: "制造费用"
};

export type ProductionRunStatus = "draft" | "carried_over" | "cancelled";

export interface Product {
  id: string;
  code: string;
  name: string;
  unit: string;
  isActive: boolean;
  note: string | null;
}

export interface RunCost {
  element: CostElement;
  /** 上期结转后留在生产成本的那部分。由系统从上期结果自动取。 */
  openingWipCents: number;
  incurredCents: number;
  /** 期末在产品对这一项的完工程度，基点。材料通常 10000。 */
  wipCompletionBp: number;
  finishedCents: number | null;
  endingWipCents: number | null;
}

export interface ProductionRun {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  productUnit: string;
  period: string;
  finishedQuantity: number;
  endingWipQuantity: number;
  status: ProductionRunStatus;
  voucherId: string | null;
  carriedOverAt: string | null;
  note: string | null;
  costs: RunCost[];
}

export interface AllocationElement {
  element: CostElement;
  equivalentUnitsBp: number;
  /** **仅供展示**——结转金额走 finishedCents/endingWipCents，那两个是整数运算的结果。 */
  unitCostCents: number;
  finishedCents: number;
  endingWipCents: number;
}

export interface Allocation {
  elements: AllocationElement[];
  totalFinishedCents: number;
  totalEndingWipCents: number;
  totalInputCents: number;
}

export async function listProducts() {
  return request<{ items: Product[]; total: number }>("/api/products");
}

export async function saveProduct(body: {
  id?: string;
  code: string;
  name: string;
  unit: string;
  note?: string | null;
}) {
  return request<{ product: Product }>("/api/products", {
    method: "PUT",
    body: JSON.stringify(body)
  });
}

export async function listProductionRuns(params: { period?: string; productId?: string } = {}) {
  const qs = new URLSearchParams();
  if (params.period) qs.set("period", params.period);
  if (params.productId) qs.set("productId", params.productId);
  const suffix = qs.toString() ? `?${qs}` : "";
  return request<{ items: ProductionRun[]; total: number }>(`/api/production-runs${suffix}`);
}

export async function saveProductionRun(body: {
  id?: string;
  productId: string;
  period: string;
  finishedQuantity: number;
  endingWipQuantity: number;
  note?: string | null;
  costs: Array<{ element: CostElement; incurredCents: number; wipCompletionBp: number }>;
}) {
  return request<{ run: ProductionRun }>("/api/production-runs", {
    method: "PUT",
    body: JSON.stringify(body)
  });
}

/** 结转预演。与实际结转走同一个纯函数，数字必然一致。 */
export async function previewProductionRun(id: string) {
  return request<{ run: ProductionRun; allocation: Allocation }>(
    `/api/production-runs/${encodeURIComponent(id)}/preview`
  );
}

export async function carryOverProductionRun(id: string, accountingDate?: string) {
  return request<{
    run: ProductionRun;
    voucherId: string;
    totalFinishedCents: number;
    totalEndingWipCents: number;
  }>(`/api/production-runs/${encodeURIComponent(id)}/carry-over`, {
    method: "POST",
    body: JSON.stringify(accountingDate ? { accountingDate } : {})
  });
}
