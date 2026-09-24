import type { TaxpayerProfile } from "@finance-taxation/domain-model";

export function resolveActiveTaxpayerProfile(
  profiles: TaxpayerProfile[],
  onDate: string
): TaxpayerProfile | null {
  const candidates = profiles
    .filter(
      (item) =>
        item.status === "active" &&
        item.effectiveFrom <= onDate &&
        // 失效日是**含**当天：填 2026-03-31 表示 3 月 31 日仍然适用。
        // null = 仍然有效，没有上界。
        (item.effectiveTo === null || item.effectiveTo === undefined || onDate <= item.effectiveTo)
    )
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  return candidates[0] || null;
}
