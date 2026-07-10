import type { Task, TaxItem, Voucher } from "@finance-taxation/domain-model";
import type { DocumentDetail } from "../../lib/api";

export interface PurchaseDocumentGuidance {
  tone: "warning" | "error";
  title: string;
  message: string;
}

export function derivePurchaseDocumentGuidance(
  detail: DocumentDetail | null,
  tasks: Task[],
  taxItems: TaxItem[],
  vouchers: Voucher[]
): PurchaseDocumentGuidance | null {
  if (!detail) {
    return null;
  }

  const taskTitles = new Set(tasks.map((task) => task.title));

  if (
    detail.documentType === "invoice_bundle" &&
    detail.status === "awaiting_upload"
  ) {
    return {
      tone: "warning",
      title: "当前单据处于缺票待上传状态",
      message: "请先补齐发票、回单或说明资料；补票前系统只保留待补票草稿。"
    };
  }

  if (
    taskTitles.has("核对重复票据与历史报销") ||
    (vouchers.length === 0 && taxItems.length === 1 && taxItems[0]?.taxType === "增值税")
  ) {
    return {
      tone: "error",
      title: "当前单据关联疑似重复报销",
      message: "当前不会继续生成正式凭证，请先核对历史报销、入账和抵扣记录。"
    };
  }

  if (
    detail.documentType === "purchase_request" ||
    detail.documentType === "acceptance_record" ||
    taskTitles.has("改走固定资产审批链")
  ) {
    return {
      tone: "warning",
      title: "当前单据已切换到固定资产/采购资料链",
      message: "后续应继续补齐采购申请、验收与资产台账，而不是按普通费用报销口径处理。"
    };
  }

  return null;
}
