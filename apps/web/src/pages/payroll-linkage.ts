export function buildPayrollLinkageSummary({
  taxItemCount,
  voucherCount,
  confirmedCount,
  totalCount,
  linkedEventId
}: {
  taxItemCount: number;
  voucherCount: number;
  confirmedCount: number;
  totalCount: number;
  linkedEventId: string | null;
}) {
  const highlights = [
    `已确认 ${confirmedCount}/${totalCount} 条工资记录`,
    `已生成 ${taxItemCount} 条税务事项`,
    `已生成 ${voucherCount} 张凭证草稿`
  ];

  const readiness =
    confirmedCount < totalCount
      ? "pending_confirmation"
      : !linkedEventId
        ? "pending_event"
        : "ready_for_tax_review";

  return {
    readiness,
    highlights
  };
}
