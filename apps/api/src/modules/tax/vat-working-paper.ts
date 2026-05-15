import type { TaxItem, TaxpayerProfile, VatWorkingPaper } from "@finance-taxation/domain-model";
import { resolveVatRate } from "./rules.js";

function parseAmount(value: string): number {
  return Number(value || 0);
}

function formatAmount(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/\.?0+$/, "");
}

export function buildVatWorkingPaper(
  profile: TaxpayerProfile,
  items: TaxItem[],
  filingPeriod: string
): VatWorkingPaper {
  const scoped = items.filter((item) => item.filingPeriod === filingPeriod && item.taxType.includes("增值税"));
  let outputTax = 0;
  let inputTax = 0;
  let simplifiedTax = 0;

  const lines = scoped.map((item, index) => {
    const taxableAmount = parseAmount(item.basis);
    const rate = Number(resolveVatRate(profile, item.treatment)) * 0.01;
    const taxAmount = taxableAmount * rate;
    let sourceType: "output" | "input" | "adjustment" = "adjustment";

    if (profile.taxpayerType === "general_vat" && item.treatment.includes("销项")) {
      outputTax += taxAmount;
      sourceType = "output";
    } else if (profile.taxpayerType === "general_vat" && item.treatment.includes("进项")) {
      inputTax += taxAmount;
      sourceType = "input";
    } else {
      if (!item.treatment.includes("进项")) {
        simplifiedTax += taxableAmount * 0.03;
        sourceType = "output";
      } else {
        sourceType = "input";
      }
    }

    return {
      id: `vat-line-${index + 1}`,
      sourceType,
      businessEventId: item.businessEventId,
      taxItemId: item.id,
      description: item.treatment,
      taxRate: formatAmount(rate * 100),
      taxableAmount: formatAmount(taxableAmount),
      taxAmount: formatAmount(
        profile.taxpayerType === "general_vat"
          ? taxAmount
          : item.treatment.includes("进项")
            ? 0
            : taxableAmount * 0.03
      )
    };
  });

  const payableVatAmount =
    profile.taxpayerType === "general_vat" ? outputTax - inputTax : simplifiedTax;

  return {
    companyId: profile.companyId,
    filingPeriod,
    taxpayerType: profile.taxpayerType,
    outputTaxAmount: formatAmount(outputTax),
    inputTaxAmount: formatAmount(inputTax),
    simplifiedTaxAmount: formatAmount(simplifiedTax),
    payableVatAmount: formatAmount(payableVatAmount),
    lines
  };
}
