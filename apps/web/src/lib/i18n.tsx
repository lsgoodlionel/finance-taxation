import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export type Lang = "zh" | "en";
const STORAGE_KEY = "ft-lang";

// ─── Translation maps (zh values) ────────────────────────────────────────────

export const EVENT_TYPE_LABELS: Record<string, string> = {
  sales: "销售", procurement: "采购", expense: "费用",
  payroll: "工资", tax: "税务", asset: "资产",
  financing: "融资", rnd: "研发", general: "其他",
  purchase_expense: "采购报销", travel_expense: "差旅报销", contract_revenue: "合同收入"
};

export const EVENT_STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  awaiting_documents: "待资料",
  awaiting_approval: "待审批",
  analyzed: "已分析",
  blocked: "已阻塞"
};

export const TASK_STATUS_LABELS: Record<string, string> = {
  not_started: "待开始",
  in_progress: "进行中",
  in_review: "待复核",
  done: "已完成",
  blocked: "已阻塞",
  cancelled: "已取消",
  pending: "待处理",
  completed: "已完成"
};

export const TASK_PRIORITY_LABELS: Record<string, string> = {
  high: "高优先级", medium: "中优先级", low: "低优先级"
};

export const TASK_PRIORITY_SHORT: Record<string, string> = {
  high: "高", medium: "中", low: "低"
};

export const DOC_STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  awaiting_upload: "待上传",
  ready: "已就绪",
  archived: "已归档",
  generated: "已生成",
  required: "待提供",
  suggested: "建议准备",
  pending: "待处理",
  under_review: "审核中",
  approved: "已通过"
};

export const DOC_TYPE_LABELS: Record<string, string> = {
  contract: "合同",
  purchase_contract: "采购合同",
  invoice: "发票",
  invoice_application: "开票申请",
  supplier_invoice: "供应商发票",
  receipt: "收据/回单",
  delivery_note: "验收单",
  acceptance_record: "验收记录",
  payment_proof: "付款凭证",
  expense_claim: "费用报销单",
  bank_statement: "银行流水",
  tax_receipt: "完税凭证",
  asset_register: "资产登记",
  payroll_slip: "工资单",
  payroll_sheet: "工资表",
  attendance_record: "考勤记录",
  tax_declaration: "申报表",
  collection_schedule: "回款计划",
  service_contract: "服务合同",
  output_invoice: "销项发票",
  billing_schedule: "开票与履约计划",
  invoice_bundle: "发票包",
  rnd_project_file: "研发项目档案",
  timesheet: "工时记录",
  supporting_document: "辅助凭证",
  other: "其他"
};

export const VOUCHER_STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  review_required: "待审核",
  approved: "已审核",
  posted: "已过账",
  rejected: "已驳回"
};

export const VOUCHER_TYPE_LABELS: Record<string, string> = {
  accrual: "权责发生",
  payment: "付款",
  receipt: "收款",
  adjustment: "调整",
  payroll: "工资",
  asset: "资产",
  tax: "税务"
};

export const TAX_STATUS_LABELS: Record<string, string> = {
  pending: "待处理",
  attention: "需关注",
  filed: "已申报",
  overdue: "已逾期",
  exempt: "免申报"
};

export const TAX_BATCH_STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  submitted: "已提交",
  reviewed: "已复核",
  filed: "已申报",
  overdue: "已逾期"
};

export const RISK_SEVERITY_LABELS: Record<string, string> = {
  critical: "致命", high: "高危", medium: "中危", low: "低危", info: "提示"
};

export const RISK_PRIORITY_LABELS: Record<string, string> = {
  high: "高", medium: "中", low: "低"
};

export const RISK_STATUS_LABELS: Record<string, string> = {
  open: "待处理", resolved: "已关闭", investigating: "调查中"
};

export const RND_STATUS_LABELS: Record<string, string> = {
  planning: "规划中", active: "进行中",
  completed: "已完成", terminated: "已终止"
};

export const CONTRACT_TYPE_LABELS: Record<string, string> = {
  sales_contract: "销售合同",
  purchase_contract: "采购合同",
  service_contract: "服务合同",
  loan_contract: "借款合同",
  lease_contract: "租赁合同",
  labor_contract: "劳动合同",
  other: "其他合同"
};

export const CONTRACT_STATUS_LABELS: Record<string, string> = {
  active: "履行中", fulfilled: "已完结", terminated: "已终止", draft: "草稿"
};

export const COUNTERPARTY_TYPE_LABELS: Record<string, string> = {
  customer: "客户", supplier: "供应商", bank: "银行",
  government: "政府机构", employee: "员工", other: "其他"
};

export const COST_TYPE_LABELS: Record<string, string> = {
  software: "软件/工具", hardware: "硬件设备", personnel: "人员费用",
  outsourcing: "外包服务", material: "材料耗材", other: "其他"
};

export const ACCOUNTING_TREATMENT_LABELS: Record<string, string> = {
  expensed: "费用化", capitalized: "资本化"
};

export const REVIEW_RESULT_LABELS: Record<string, string> = {
  approved: "审核通过", rejected: "审核驳回"
};

// ─── English fallback (title-case the raw key) ───────────────────────────────

function toEnglishLabel(key: string): string {
  return key.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Translate a single key using a label map */
  t: (map: Record<string, string>, key: string) => string;
}

const I18nContext = createContext<I18nCtx>({
  lang: "zh",
  setLang: () => undefined,
  t: (map, key) => map[key] ?? key
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "en" ? "en" : "zh";
  });

  function setLang(l: Lang) {
    setLangState(l);
    localStorage.setItem(STORAGE_KEY, l);
  }

  function t(map: Record<string, string>, key: string): string {
    if (!key) return "—";
    if (lang === "zh") return map[key] ?? key;
    return toEnglishLabel(key);
  }

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
