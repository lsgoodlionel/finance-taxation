import type { TaxpayerProfile } from "@finance-taxation/domain-model";

export function resolveActiveTaxpayerProfile(
  profiles: TaxpayerProfile[],
  onDate: string
): TaxpayerProfile | null {
  const candidates = profiles
    .filter((item) => item.status === "active" && item.effectiveFrom <= onDate)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  return candidates[0] || null;
}
