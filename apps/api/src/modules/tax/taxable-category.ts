/**
 * 应税行为类别 → 增值税税率档（V17 阶段一）。
 *
 * ## 这一层解决什么
 *
 * `resolveVatRate` 此前对一般纳税人一律返回 13%，不看业务性质——
 * 一家做咨询服务的公司（应适用 6%）会被按 13% 算，多算一倍还多。
 * 税务专员在 V16 角色实验里报的就是这条。
 *
 * 税率主数据（`tax_rates`）本身是完整的：13/9/6/5/3/0 六档齐全、
 * 适用范围写清楚、沿革也在。缺的是**「这笔业务该用哪一档」**的判定。
 *
 * ## 为什么不按 business_events.type 推
 *
 * `type`（sales / procurement / expense…）是**记账口径**——这笔业务在账上怎么走。
 * 税率适用要的是**税目口径**——这笔业务卖的是什么。两者不是一回事：
 * 一笔 `sales` 可能是卖货（13%）、卖服务（6%）、卖不动产（9%）。
 *
 * 拿记账分类去推税目，等于用一个维度回答另一个维度的问题。
 *
 * ## 政策依据
 *
 * 完整的类别清单、法条出处与判定优先级见
 * `docs/v17-tax-rate-policy/POLICY-MAP.md`。这里只放代码需要的那部分。
 */

/**
 * 应税行为类别。对应税法的应税行为分类，不是记账分类。
 *
 * 值本身存进 `business_events.taxable_category` 与
 * `companies.default_taxable_category`。
 */
export type TaxableCategory =
  // ── 13% ──
  | "goods" // 销售货物
  | "processing" // 加工修理修配劳务
  | "tangible_lease" // 有形动产租赁
  // ── 9% ──
  | "transport" // 交通运输服务
  | "postal" // 邮政服务
  | "basic_telecom" // 基础电信服务
  | "construction" // 建筑服务
  | "real_estate_lease" // 不动产租赁
  | "real_estate_sale" // 销售不动产
  | "land_use_right" // 转让土地使用权
  | "agricultural" // 农产品等
  // ── 6% ──
  | "modern_service" // 现代服务
  | "financial_service" // 金融服务
  | "lifestyle_service" // 生活服务
  | "value_added_telecom" // 增值电信服务
  | "intangible_asset" // 销售无形资产（土地使用权除外）
  // ── 0% ──
  | "export_zero_rated"; // 出口 / 跨境零税率

/**
 * 类别 → 税率主数据的 code。
 *
 * **映射到 code 而不是税率数字**：税率是有沿革的（13% 曾是 17%、16%），
 * 具体数值要按业务发生日去 `tax_rates` 表里取。这里只回答「用哪一档」。
 */
const CATEGORY_TO_RATE_CODE: Record<TaxableCategory, string> = {
  goods: "vat_basic",
  processing: "vat_basic",
  tangible_lease: "vat_basic",

  transport: "vat_low",
  postal: "vat_low",
  basic_telecom: "vat_low",
  construction: "vat_low",
  real_estate_lease: "vat_low",
  real_estate_sale: "vat_low",
  land_use_right: "vat_low",
  agricultural: "vat_low",

  modern_service: "vat_service",
  financial_service: "vat_service",
  lifestyle_service: "vat_service",
  value_added_telecom: "vat_service",
  intangible_asset: "vat_service",

  export_zero_rated: "vat_zero"
};

/** 类别的中文说法，用在给用户看的提示里。 */
const CATEGORY_LABELS: Record<TaxableCategory, string> = {
  goods: "销售货物",
  processing: "加工修理修配劳务",
  tangible_lease: "有形动产租赁",
  transport: "交通运输服务",
  postal: "邮政服务",
  basic_telecom: "基础电信服务",
  construction: "建筑服务",
  real_estate_lease: "不动产租赁",
  real_estate_sale: "销售不动产",
  land_use_right: "转让土地使用权",
  agricultural: "农产品等",
  modern_service: "现代服务",
  financial_service: "金融服务",
  lifestyle_service: "生活服务",
  value_added_telecom: "增值电信服务",
  intangible_asset: "销售无形资产",
  export_zero_rated: "出口 / 跨境零税率"
};

/**
 * 全部类别，顺序按税率档从高到低——给用户看的清单要有个稳定的次序，
 * 而「先 13% 再 9% 再 6%」和税法条文的排法一致。
 */
export const ALL_TAXABLE_CATEGORIES = Object.keys(CATEGORY_TO_RATE_CODE) as TaxableCategory[];

export function isTaxableCategory(value: unknown): value is TaxableCategory {
  return typeof value === "string" && value in CATEGORY_TO_RATE_CODE;
}

export function taxableCategoryLabel(category: TaxableCategory): string {
  return CATEGORY_LABELS[category];
}

/**
 * 这个类别用哪一档税率（返回 `tax_rates.code`）。
 *
 * 认不出的类别返回 `null`——**不给默认档**。给一个默认值意味着
 * 一笔税目不明的业务会带着某个税率静默进申报表，而没人知道它是猜的。
 */
export function rateCodeForCategory(category: string | null | undefined): string | null {
  if (!isTaxableCategory(category)) return null;
  return CATEGORY_TO_RATE_CODE[category];
}

/**
 * 判定一笔业务该用哪一档增值税税率。
 *
 * 优先级（见 POLICY-MAP.md 第 2.3 节）：
 *   1. 零税率（出口、跨境）
 *   2. 小规模纳税人 / 一般纳税人简易计税 → 征收率
 *   3. 按应税行为类别取档
 *   4. **类别未知 → 返回 null，不猜**
 *
 * @returns `tax_rates.code`，或 `null` 表示「税目待确认」。
 */
export function resolveVatRateCode(input: {
  taxpayerType: string;
  /** 事项上的类别，优先于公司默认值。 */
  eventCategory?: string | null;
  /** 公司主营类别，事项没指明时的兜底。 */
  companyDefaultCategory?: string | null;
  /** 税务处理说明，用来识别简易计税等特殊情形。 */
  treatment?: string;
}): string | null {
  const category = input.eventCategory ?? input.companyDefaultCategory ?? null;

  // 1. 零税率优先于一切：出口业务不因为纳税人身份而改变。
  if (category === "export_zero_rated") return "vat_zero";

  // 2. 小规模与简易计税走征收率，不看应税行为类别。
  //
  // **两个档不能混**：`vat_small` 与 `vat_simplified` 在税率主数据里按
  // `taxpayer_type` 区分，而且小规模那档带减征沿革（3% 减按 1%，
  // 2023-01-01 起）。把小规模指到 `vat_simplified` 会取不到税率、算出 0——
  // 这是我第一版犯的错，被既有的减征沿革测试抓住了。
  if (input.taxpayerType === "small_scale") {
    return "vat_small";
  }
  if (input.taxpayerType === "general_simplified" || input.treatment?.includes("简易")) {
    return "vat_simplified";
  }

  // 3-4. 按类别取档；认不出就是认不出。
  return rateCodeForCategory(category);
}
