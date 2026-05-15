import type { TaxRuleProfile, TaxpayerProfile } from "@finance-taxation/domain-model";

function quarterFromDate(date: string): string {
  const month = Number(date.slice(5, 7));
  return `${date.slice(0, 4)}-Q${Math.ceil(month / 3)}`;
}

export function resolveTaxRuleProfile(profile: TaxpayerProfile, taxType: string): TaxRuleProfile {
  if (taxType.includes("增值税")) {
    if (profile.taxpayerType === "small_scale") {
      return {
        taxType,
        taxpayerType: profile.taxpayerType,
        filingFrequency: "quarterly",
        defaultRate: "3"
      };
    }
    if (profile.taxpayerType === "general_simplified") {
      return {
        taxType,
        taxpayerType: profile.taxpayerType,
        filingFrequency: "monthly",
        defaultRate: "3"
      };
    }
    return {
      taxType,
      taxpayerType: profile.taxpayerType,
      filingFrequency: "monthly",
      defaultRate: "13"
    };
  }

  if (taxType.includes("企业所得税")) {
    return {
      taxType,
      taxpayerType: profile.taxpayerType,
      filingFrequency: "quarterly",
      defaultRate: "25"
    };
  }

  if (taxType.includes("研发加计扣除")) {
    return {
      taxType,
      taxpayerType: profile.taxpayerType,
      filingFrequency: "yearly",
      defaultRate: "0"
    };
  }

  return {
    taxType,
    taxpayerType: profile.taxpayerType,
    filingFrequency: "monthly",
    defaultRate: "0"
  };
}

export function resolveFilingPeriod(occurredOn: string, profile: TaxpayerProfile, taxType: string): string {
  const rule = resolveTaxRuleProfile(profile, taxType);
  if (rule.filingFrequency === "quarterly") {
    return quarterFromDate(occurredOn);
  }
  if (rule.filingFrequency === "yearly") {
    return occurredOn.slice(0, 4);
  }
  return occurredOn.slice(0, 7);
}

export function resolveVatRate(profile: TaxpayerProfile, treatment: string): string {
  if (profile.taxpayerType === "small_scale" || profile.taxpayerType === "general_simplified") {
    return "3";
  }
  if (treatment.includes("简易")) {
    return "3";
  }
  return "13";
}
