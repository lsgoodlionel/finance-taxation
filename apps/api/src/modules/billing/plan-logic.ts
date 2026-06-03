/**
 * P8-C3 订阅计费纯逻辑（套餐价格 / 周期 / 配额 / 功能门）。
 */

export type BillingCycle = "monthly" | "yearly";

export interface PlanLimits {
  seats: number;
  employees: number;
  aiCallsPerMonth: number;
  bankAccounts: number;
}

export interface Plan {
  code: string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  limits: PlanLimits;
  features: string[];
}

/** 周期应付金额。 */
export function planPrice(plan: Plan, cycle: BillingCycle): number {
  return cycle === "yearly" ? plan.priceYearly : plan.priceMonthly;
}

/** 周期结束时间（按周期加 1 月 / 1 年）。 */
export function periodEnd(start: Date, cycle: BillingCycle): Date {
  const d = new Date(start);
  if (cycle === "yearly") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

export interface QuotaCheck {
  key: string;
  limit: number;      // -1 = 无限
  used: number;
  remaining: number;  // -1 = 无限
  allowed: boolean;
  exceeded: boolean;
}

/** 配额检查：limit=-1 视为无限。 */
export function checkQuota(limit: number, used: number, key: string): QuotaCheck {
  if (limit < 0) {
    return { key, limit: -1, used, remaining: -1, allowed: true, exceeded: false };
  }
  const remaining = Math.max(0, limit - used);
  return { key, limit, used, remaining, allowed: used < limit, exceeded: used >= limit };
}

/** 功能门：套餐是否包含某功能。 */
export function hasFeature(features: string[], key: string): boolean {
  return features.includes(key);
}

/** 升/降级是否为升级（按月价比较）。 */
export function isUpgrade(from: Plan, to: Plan): boolean {
  return to.priceMonthly > from.priceMonthly;
}
