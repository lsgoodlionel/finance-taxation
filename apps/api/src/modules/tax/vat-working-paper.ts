import { resolveVatRateCode } from "./taxable-category.js";
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
/**
 * 底稿用的税率档判定（V17：接上应税行为类别）。
 *
 * 此前这里对一般纳税人一律返回 `vat_basic`（13%），上面那段注释诚实地记着
 * 「服务业客户的底稿仍会按基本税率算……那是 D2 的后续项」——
 * 现在把它做完了：类别 → 档位的映射在 `taxable-category.ts`，
 * 政策依据见 `docs/v17-tax-rate-policy/POLICY-MAP.md`。
 *
 * 返回 `null` 表示**税目待确认**，调用方必须把这笔排除在合计外并显式列出，
 * 不能拿一个默认档顶上——那会让一个猜出来的税率静默进申报表。
 */
export function resolveVatRateCodeForItem(input: {
  taxpayerType: TaxpayerProfile["taxpayerType"];
  treatment: string;
  eventCategory?: string | null;
  companyDefaultCategory?: string | null;
}): string | null {
  return resolveVatRateCode({
    taxpayerType: input.taxpayerType,
    treatment: input.treatment,
    eventCategory: input.eventCategory,
    companyDefaultCategory: input.companyDefaultCategory
  });
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
  rates: readonly TaxRate[],
  /**
   * 公司主营的应税行为类别（V17）。事项没指明类别时的兜底。
   *
   * `null` = 没配。此时凡是事项也没标类别的税项都算「税目待确认」，
   * 不参与合计——**不猜一个档位**。
   */
  companyDefaultCategory: string | null = null
): VatWorkingPaper {
  const on = periodStartDate(filingPeriod);
  /**
   * 取该属期适用的实际征收比例（小数）。
   *
   * 找不到税率时按 0 算并不比按 13% 算更"安全"，但它会让底稿上出现一个
   * 显眼的 0 而不是一个看着合理的错数——前者会被人追问，后者会被签字通过。
   */
  const rateOf = (treatment: string, eventCategory?: string | null): number => {
    const code = resolveVatRateCodeForItem({
      taxpayerType: profile.taxpayerType,
      treatment,
      eventCategory,
      companyDefaultCategory
    });
    // 税目待确认：返回 0 让它在底稿上显眼，而不是拿 13% 顶上。
    // 该笔是否计入合计由 basisMissing / categoryMissing 决定，不靠这个 0。
    if (!code) return 0;
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

  /**
   * 计税依据缺失的税项。
   *
   * 它们**不参与合计**，但必须在底稿上显式列出来——一份少算了一笔的申报表，
   * 如果没有任何提示，会被当成完整的报上去。
   */
  const missingBasisLines: string[] = [];

  /**
   * 税目未确定的税项（V17）。
   *
   * 与「计税依据缺失」分开记：前者是不知道**按什么税率**算，
   * 后者是不知道**按多少钱**算。两种都不能进合计，但用户要补的东西不同——
   * 合并成一句「数据不全」会让人不知道该去改哪里。
   */
  const missingCategoryLines: string[] = [];

  const lines = scoped.map((item, index) => {
    // **金额取 taxableAmountCents，不是 basis。**
    //
    // basis 存的是政策依据散文（「需结合交付、验收或约定开票条件确认纳税义务
    // 发生时点。」）。这里曾写 `Number(item.basis)` → NaN，一路流进底稿、
    // 申报向导和申报 XML——`<本期销项税额>NaN</本期销项税额>` 就是这么来的。
    //
    // 模块自己的单测用 `basis: "1000"` 构造输入，所以一直是绿的：
    // 测试喂的输入不是系统真实产生的输入。
    const hasBasis =
      item.taxableAmountCents !== null &&
      item.taxableAmountCents !== undefined &&
      Number.isFinite(item.taxableAmountCents);
    const taxableAmount = hasBasis ? item.taxableAmountCents! / 100 : 0;
    if (!hasBasis) {
      missingBasisLines.push(item.id);
    }
    const rateCode = resolveVatRateCodeForItem({
      taxpayerType: profile.taxpayerType,
      treatment: item.treatment,
      eventCategory: item.taxableCategory,
      companyDefaultCategory
    });
    if (!rateCode) missingCategoryLines.push(item.id);
    const rate = rateOf(item.treatment, item.taxableCategory);
    const taxAmount = taxableAmount * rate;
    let sourceType: "output" | "input" | "adjustment" = "adjustment";

    if (profile.taxpayerType === "general_vat" && item.treatment.includes("销项")) {
      // 计税依据缺失的行只归类、不计金额——把它当 0 加进去，
      // 合计会看起来是个正常数字，而少的那一笔没人知道。
      if (hasBasis && rateCode) outputTax += taxAmount;
      sourceType = "output";
    } else if (profile.taxpayerType === "general_vat" && item.treatment.includes("进项")) {
      if (hasBasis && rateCode) inputTax += taxAmount;
      sourceType = "input";
    } else {
      if (!item.treatment.includes("进项")) {
        if (hasBasis && rateCode) simplifiedTax += taxableAmount * simplifiedRate;
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
      /** 计税依据缺失时为 null——**不是 "0.00"**，那会让人以为这笔业务金额为零。 */
      taxableAmount: hasBasis ? formatAmount(taxableAmount) : null,
      basisMissing: !hasBasis,
      /** 税目未确定，本行未纳入合计——不知道该按哪一档税率算。 */
      categoryMissing: !rateCode,
      taxAmount: hasBasis
        ? formatAmount(
            profile.taxpayerType === "general_vat"
              ? taxAmount
              : item.treatment.includes("进项")
                ? 0
                : taxableAmount * simplifiedRate
          )
        : null
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
    /**
     * 计税依据缺失、未纳入合计的税项 id。
     *
     * 非空时上面那几个合计**是不完整的**，调用方必须把这件事显示出来。
     * 底稿、申报向导、申报导出三处都要拦——一份少算了一笔的申报表，
     * 没有提示就会被当成完整的报上去。
     */
    incompleteTaxItemIds: missingBasisLines,
    /**
     * 税目未确定、未纳入合计的税项 id（V17）。
     *
     * 与 `incompleteTaxItemIds` 分开：那个是「不知道按多少钱算」，
     * 这个是「不知道按什么税率算」。用户要补的东西不同，
     * 合并成一句「数据不全」会让人不知道该去改哪里。
     */
    unknownCategoryTaxItemIds: missingCategoryLines,
    lines
  };
}
