/**
 * 月结编排各步骤 → 可直达处理页面的映射（非必需，仅覆盖已有明确落地页的步骤）。
 */

export interface CloseStepLink {
  path: string;
  cta: string;
}

export const CLOSE_STEP_LINKS: Record<string, CloseStepLink> = {
  sweep_unposted: { path: "/events", cta: "前往事件工作台" },
  tax_consistency: { path: "/tax", cta: "前往税务中心" },
  close_income: { path: "/ledger", cta: "前往总账中心" },
  snapshot: { path: "/reports", cta: "前往财务报表" },
  filing_draft: { path: "/tax", cta: "前往税务中心" },
  archive: { path: "/export-center", cta: "前往导出中心" },
};
