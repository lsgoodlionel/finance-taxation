import type { Contract, GeneratedDocument, Task, TaxItem, Voucher } from "@finance-taxation/domain-model";
import type { ContractFollowupAction } from "../contract-event";

// ─── Shared labels / styles / view types for ContractsPage ───────────────────

export const CONTRACT_TYPE_LABELS: Record<string, string> = {
  sales: "销售合同",
  sale: "销售合同",
  procurement: "采购合同",
  purchase: "采购合同",
  lease: "租赁合同",
  service: "服务合同",
  loan: "借款合同",
  other: "其他"
};

export const STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  active: "执行中",
  fulfilled: "已履行",
  terminated: "已终止",
  expired: "已到期"
};

export const STATUS_COLOR: Record<string, string> = {
  draft: "#8a9bb0",
  active: "#1a7f5a",
  fulfilled: "#4a7fc4",
  terminated: "#c0392b",
  expired: "#b0890a"
};

export const FOLLOWUP_ACTION_LABELS: Record<ContractFollowupAction, string> = {
  invoice: "开票",
  collection: "回款/付款",
  revenue: "收入确认",
  procurement_execution: "采购执行",
  payment_arrangement: "付款安排",
  acceptance: "验收归档",
  lease_payment: "租赁付款",
  lease_accrual: "费用确认"
};

export const WORKFLOW_STATE_LABELS = {
  done: "已完成",
  in_progress: "处理中",
  blocked: "已阻塞",
  pending: "待推进"
} as const;

export const WORKFLOW_STATE_STYLES = {
  done: { border: "rgba(26,127,90,0.16)", bg: "rgba(26,127,90,0.06)", tagBg: "rgba(26,127,90,0.12)", color: "#1a7f5a" },
  in_progress: { border: "rgba(37,99,235,0.16)", bg: "rgba(37,99,235,0.06)", tagBg: "rgba(37,99,235,0.12)", color: "#2563eb" },
  blocked: { border: "rgba(192,57,43,0.16)", bg: "rgba(192,57,43,0.06)", tagBg: "rgba(192,57,43,0.12)", color: "#c0392b" },
  pending: { border: "rgba(176,137,10,0.16)", bg: "rgba(255,186,8,0.08)", tagBg: "rgba(176,137,10,0.12)", color: "#b0890a" }
} as const;

export function panelStyle() {
  return {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)",
    padding: "24px"
  } as const;
}

export interface ContractDetailView {
  contract: Contract;
  relatedEvents: { id: string; title: string; status: string; createdAt: string }[];
  relatedTasks: Task[];
  relatedDocuments: GeneratedDocument[];
  relatedTaxItems: TaxItem[];
  relatedVouchers: Voucher[];
}

export type RelatedEventView = ContractDetailView["relatedEvents"][number];
