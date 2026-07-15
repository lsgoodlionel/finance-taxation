export const STATUS_TAG: Record<string, { color: string; label: string }> = {
  draft:     { color: "default",    label: "草稿" },
  approved:  { color: "blue",       label: "已审批" },
  exported:  { color: "geekblue",   label: "已导出" },
  disbursed: { color: "green",      label: "已代发" },
  confirmed: { color: "success",    label: "已对账" },
};
