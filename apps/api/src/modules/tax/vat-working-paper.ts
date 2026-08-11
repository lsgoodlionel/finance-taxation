import type { TaxItem, TaxpayerProfile, VatWorkingPaper } from "@finance-taxation/domain-model";
import { effectiveRateOf, resolveTaxRate, type TaxRate } from "./tax-rate.js";

/**
 * 从申报属期推出取税率的日期（V12-D2）。
 *
 * 取**期间首日**：增值税历次改版都在月初生效（2018-05-01、2019-04-01），
 * 因此按月或按季的属期不会跨改版点，首日与末日给出同一档税率。
 * 万一将来出现月中改版，首日口径也与「这个属期整体适用哪档」的申报习惯一致。
 */
export function periodStartDate(filingPeriod: string): string {
  const quarter = /^(\d{4})-Q([1-4])$/.exec(filingPeriod);
  if (quarter) {
    const startMonth = (Number(quarter[2]) - 1) * 3 + 1;
    return `${quarter[1]}-${String(startMonth).padStart(2, "0")}-01`;
  }
  if (/^\d{4}-\d{2}$/.test(filingPeriod)) return `${filingPeriod}-01`;
  if (/^\d{4}$/.test(filingPeriod)) return `${filingPeriod}-01-01`;
  return filingPeriod;
}

/**
 * 一条税目该套哪档税率的 code。
 *
 * **已知限制**：只区分得出基本税率 / 简易计税 / 小规模三档。9%（交通运输、
 * 建筑、不动产租赁）与 6%（现代服务、金融、生活服务）区分不出来 —— `treatment`
 * 是自由文本，从"提供咨询服务"这样的描述里猜税率档次是不可靠的，猜错比
 * 报错更糟。要支持这两档，需要 `tax_items` 带上 `rate_code` 字段由录入时选定，
 * 那是 D2 的后续项。
 *
 * 在那之前，服务业客户的底稿仍会按基本税率算 —— 这一点没有变好，但也没有
 * 变差，且现在至少税率的**时点**和**减征**是对的。
 */
export function resolveVatRateCode(
  taxpayerType: TaxpayerProfile["taxpayerType"],
  treatment: string
): string {
  if (taxpayerType === "small_scale") return "vat_small";
  if (taxpayerType === "general_simplified" || treatment.includes("简易")) return "vat_simplified";
  return "vat_basic";
}

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
  filingPeriod: string,
  /**
   * 可见的税率主数据（V12-D2）。**必传**：不给默认值是刻意的——
   * 留一条"没传就按 13% 算"的退路，等于让旧口径继续悄悄存活。
   */
  rates: readonly TaxRate[]
): VatWorkingPaper {
  const on = periodStartDate(filingPeriod);
  /**
   * 取该属期适用的实际征收比例（小数）。
   *
   * 找不到税率时按 0 算并不比按 13% 算更"安全"，但它会让底稿上出现一个
   * 显眼的 0 而不是一个看着合理的错数——前者会被人追问，后者会被签字通过。
   */
  const rateOf = (treatment: string): number => {
    const code = resolveVatRateCode(profile.taxpayerType, treatment);
    const matched = resolveTaxRate(rates, {
      taxType: "vat",
      code,
      on,
      taxpayerType: profile.taxpayerType
    });
    return matched ? effectiveRateOf(matched) * 0.01 : 0;
  };
  /** 小规模/简易计税的征收率，替代此前写死的 0.03。 */
  const simplifiedRate = rateOf("简易");
  const scoped = items.filter((item) => item.filingPeriod === filingPeriod && item.taxType.includes("增值税"));
  let outputTax = 0;
  let inputTax = 0;
  let simplifiedTax = 0;

  const lines = scoped.map((item, index) => {
    const taxableAmount = parseAmount(item.basis);
    const rate = rateOf(item.treatment);
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
        simplifiedTax += taxableAmount * simplifiedRate;
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
            : taxableAmount * simplifiedRate
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
