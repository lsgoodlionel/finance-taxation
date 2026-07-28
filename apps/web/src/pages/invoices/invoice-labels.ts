/**
 * 发票台账共用的枚举文案。
 *
 * 从 InvoicesPage 抽出来，是因为录入弹窗（InvoiceEntryModals）与列表列都要用同一份
 * 发票类型名称，抄两份迟早会漂移。
 */
export const VERIFY_COLOR: Record<string, string> = {
  pending: "default",
  verified: "success",
  invalid: "error",
  error: "warning"
};

export const VERIFY_LABELS: Record<string, string> = {
  pending: "待验真",
  verified: "已验真",
  invalid: "不合规",
  error: "验真异常"
};

export const INV_TYPE_LABELS: Record<string, string> = {
  vat_special: "增值税专票",
  vat_general: "增值税普票",
  electronic: "电子发票",
  receipt: "收据",
  other: "其他"
};
