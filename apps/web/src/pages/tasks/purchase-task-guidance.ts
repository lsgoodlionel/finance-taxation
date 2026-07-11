import type { Task } from "@finance-taxation/domain-model";

export interface PurchaseTaskGuidance {
  tone: "warning" | "error";
  title: string;
  message: string;
}

export function derivePurchaseTaskGuidance(tasks: Task[]): PurchaseTaskGuidance | null {
  const titles = new Set(tasks.map((task) => task.title));

  if (titles.has("核对重复票据与历史报销")) {
    return {
      tone: "error",
      title: "当前任务集对应疑似重复报销",
      message: "建议先核对历史报销、入账与抵扣记录，再决定关闭重复事项或并单处理。"
    };
  }

  if (titles.has("改走固定资产审批链")) {
    return {
      tone: "warning",
      title: "当前任务集已切换到固定资产处理口径",
      message: "请优先补齐采购申请、验收与资产台账资料，后续凭证和税务按固定资产逻辑推进。"
    };
  }

  if (titles.has("补齐发票与票据依据")) {
    return {
      tone: "warning",
      title: "当前任务集处于缺票待补资料阶段",
      message: "补票前不应形成正式过账和完整税务结论，建议先把报销票据包补齐。"
    };
  }

  return null;
}
