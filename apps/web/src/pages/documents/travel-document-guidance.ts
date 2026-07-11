import type { Task, TaxItem, Voucher } from "@finance-taxation/domain-model";
import type { DocumentDetail } from "../../lib/api";

export interface TravelDocumentGuidance {
  tone: "warning" | "error";
  title: string;
  message: string;
}

export function deriveTravelDocumentGuidance(
  detail: DocumentDetail | null,
  tasks: Task[],
  taxItems: TaxItem[],
  vouchers: Voucher[]
): TravelDocumentGuidance | null {
  if (!detail) {
    return null;
  }

  const taskTitles = new Set(tasks.map((task) => task.title));

  if (detail.documentType === "hotel_invoice" && detail.status === "awaiting_upload") {
    return {
      tone: "warning",
      title: "当前单据处于缺住宿票待上传状态",
      message: "请先补齐住宿发票、入住凭证和行程说明；补票前系统只保留暂估差旅草稿。"
    };
  }

  if (
    taskTitles.has("核对重复差旅报销记录") ||
    (vouchers.length === 0 && taxItems.length === 1 && taxItems[0]?.taxType === "增值税")
  ) {
    return {
      tone: "error",
      title: "当前单据关联疑似重复差旅报销",
      message: "当前不会继续生成正式凭证，请先核对历史差旅报销、入账和抵扣记录。"
    };
  }

  if (
    taskTitles.has("拆分跨期差旅归属月份") ||
    (detail.documentType === "travel_request" && taxItems.some((item) => item.treatment.includes("归属期")))
  ) {
    return {
      tone: "warning",
      title: "当前单据已进入跨期差旅处理链",
      message: "后续应按实际出差月份拆分费用归属，并分别复核抵扣月份和所得税期间。"
    };
  }

  return null;
}
