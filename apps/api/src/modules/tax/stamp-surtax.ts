import type { StampAndSurtaxSummary, TaxItem } from "@finance-taxation/domain-model";

export function buildStampAndSurtaxSummary(
  companyId: string,
  filingPeriod: string,
  taxItems: TaxItem[]
): StampAndSurtaxSummary {
  const scoped = taxItems.filter((item) => item.filingPeriod === filingPeriod);
  const stampDutyItems = scoped.filter((item) => item.taxType.includes("印花税"));
  const surtaxItems = scoped.filter((item) => item.taxType.includes("附加"));
  return {
    companyId,
    filingPeriod,
    stampDutyItems,
    surtaxItems,
    notes: [
      "印花税需结合合同、产权转移书据、营业账簿等资料复核。",
      "附加税通常依附增值税等主税形成，需和主税底稿联动检查。"
    ]
  };
}
