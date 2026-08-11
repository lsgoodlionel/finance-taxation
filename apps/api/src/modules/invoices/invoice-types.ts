/**
 * 发票类型的唯一事实来源，以及「进项税额能否抵扣」的判定（V12-A4 / 蓝图 E3）。
 *
 * ## 为什么需要这个模块
 *
 * `buildInvoiceVoucherDraft` 此前只 switch 了 `direction`，进项一律挂
 * `222102 应交税费-应交增值税（进项）`。**普通发票、收据本不可抵扣，却被当成专用
 * 发票做了进项抵扣**，直接导致增值税申报少缴税。
 *
 * ## 取值统一
 *
 * `invoices.invoice_type` 此前无 CHECK 约束，库里同时存在两种拼法：
 * - `migrations/020_p1_integration.sql:10` 的列注释与前端 `INV_TYPE_LABELS`
 *   都写 `vat_general`；
 * - `migrations/025_seed_demo_invoices.sql:12` 的演示数据写的是 `vat_common`。
 *
 * 判断：`vat_general` 是规范拼法（三处来源里占两处，且是前端下拉的实际取值），
 * `vat_common` 是演示数据里的笔误，**不是一个独立的业务含义**。因此把它作为别名
 * 归一到 `vat_general`，而不是纳入合法取值——纳入合法取值等于把笔误固化成契约，
 * 以后每个读发票类型的地方都要记得判两个值。
 *
 * 别名在应用层保留识别能力（而不是只靠 DB 迁移），是因为**在迁移落库之前**存量
 * `vat_common` 行也必须被正确判成不可抵扣。少了这一层，迁移落地前这段时间的
 * 错账照旧。
 *
 * ## 抵扣规则（中国增值税）
 *
 * - 增值税专用发票：可抵扣；
 * - 增值税普通发票：原则上不可抵扣；
 * - 收据：完全不可抵扣；
 * - 电子发票：**保守判为不可抵扣**。见下方 `electronic` 的说明。
 *
 * 农产品收购发票、通行费电子发票等少数可抵扣的例外，本次不做特例（蓝图明确）。
 */

/** 规范取值。顺序即前端下拉与 DB CHECK 的期望顺序。 */
export const INVOICE_TYPES = [
  "vat_special",
  "vat_general",
  "electronic",
  "receipt",
  "other"
] as const;

export type InvoiceType = (typeof INVOICE_TYPES)[number];

/**
 * 历史拼法 → 规范取值。
 *
 * `vat_common` 只出现在 025 演示数据里，含义就是增值税普通发票。
 */
const INVOICE_TYPE_ALIASES: Readonly<Record<string, InvoiceType>> = {
  vat_common: "vat_general"
};

const CANONICAL_INVOICE_TYPES = new Set<string>(INVOICE_TYPES);

/**
 * 可抵扣进项税的发票类型。**白名单**而非黑名单：新增一个类型时默认不可抵扣，
 * 漏判的方向是多缴税（可发现、可纠正），而不是少缴税（税务违规）。
 *
 * `electronic` 不在白名单里：这个取值只说明发票的**载体**是电子的，说明不了它是
 * 电子专票还是电子普票。全电发票下两者都存在，仅凭 `electronic` 无法判定可抵扣性，
 * 因此按不可抵扣处理。要恢复电子专票的抵扣，应把取值拆成
 * `electronic_special` / `electronic_general`，而不是放宽这里的判定。
 */
const DEDUCTIBLE_INVOICE_TYPES: ReadonlySet<InvoiceType> = new Set<InvoiceType>([
  "vat_special"
]);

/**
 * 把任意外部输入归一成规范取值；无法识别时返回 `null`。
 *
 * 返回 `null` 而不是兜底成某个值，是为了让写入路径能明确拒绝非法输入
 * （`POST /api/invoices` 的 `invoiceType` 此前是 `max:50` 的自由文本）。
 */
export function normalizeInvoiceType(raw: string | null | undefined): InvoiceType | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().toLowerCase();
  if (CANONICAL_INVOICE_TYPES.has(trimmed)) return trimmed as InvoiceType;
  return INVOICE_TYPE_ALIASES[trimmed] ?? null;
}

/**
 * 进项税额是否可抵扣。
 *
 * 无法识别的取值（含 `undefined`、空、以及将来数据库里冒出来的新值）一律判为
 * **不可抵扣**——见 `DEDUCTIBLE_INVOICE_TYPES` 的白名单理由。
 */
export function isInputTaxDeductible(rawInvoiceType: string | null | undefined): boolean {
  const normalized = normalizeInvoiceType(rawInvoiceType);
  if (normalized === null) return false;
  return DEDUCTIBLE_INVOICE_TYPES.has(normalized);
}
