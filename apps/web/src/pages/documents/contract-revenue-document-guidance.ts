import type { Task, TaxItem, Voucher } from "@finance-taxation/domain-model";
import type { DocumentDetail } from "../../lib/api";

export interface ContractRevenueDocumentGuidance {
  tone: "warning" | "error";
  title: string;
  message: string;
}

export function deriveContractRevenueDocumentGuidance(
  detail: DocumentDetail | null,
  tasks: Task[],
  taxItems: TaxItem[],
  vouchers: Voucher[]
): ContractRevenueDocumentGuidance | null {
  if (!detail) {
    return null;
  }

  const taskTitles = new Set(tasks.map((task) => task.title));

  if (detail.documentType === "acceptance_record" && detail.status === "awaiting_upload") {
    return {
      tone: "warning",
      title: "当前单据处于缺验收待上传状态",
      message: "请先补齐验收单、交付证明和客户确认资料；补齐前系统只保留待复核收入草稿。"
    };
  }

  if (
    taskTitles.has("核对重复合同与收入主链") ||
    (vouchers.length === 0 && taxItems.length === 1 && taxItems[0]?.taxType === "增值税")
  ) {
    return {
      tone: "error",
      title: "当前单据关联疑似重复收入确认",
      message: "当前不会继续生成正式收入凭证，请先核对合同主档、应收和销项税主链。"
    };
  }

  if (
    taskTitles.has("拆分服务期间收入归属") ||
    (detail.documentType === "billing_schedule" && taxItems.some((item) => item.treatment.includes("分别复核")))
  ) {
    return {
      tone: "warning",
      title: "当前单据已进入分期收入确认链",
      message: "后续应按履约期间拆分收入归属，并分别复核销项税和所得税确认时点。"
    };
  }

  return null;
}
