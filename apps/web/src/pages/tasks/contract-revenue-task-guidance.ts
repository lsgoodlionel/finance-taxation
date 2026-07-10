import type { Task } from "@finance-taxation/domain-model";

export interface ContractRevenueTaskGuidance {
  tone: "warning" | "error";
  title: string;
  message: string;
}

export function deriveContractRevenueTaskGuidance(tasks: Task[]): ContractRevenueTaskGuidance | null {
  const titles = new Set(tasks.map((task) => task.title));

  if (titles.has("核对重复合同与收入主链")) {
    return {
      tone: "error",
      title: "当前任务集对应疑似重复收入确认",
      message: "建议先核对合同主档、历史收入确认和销项税主链，再决定关闭重复流转。"
    };
  }

  if (titles.has("拆分服务期间收入归属")) {
    return {
      tone: "warning",
      title: "当前任务集已切换到分期收入确认",
      message: "请按履约期间拆分各期收入，并分别复核销项税时点和所得税收入归属期。"
    };
  }

  if (titles.has("补齐验收单与履约证据")) {
    return {
      tone: "warning",
      title: "当前任务集处于缺验收待补阶段",
      message: "补齐验收单前不应正式确认收入，建议先锁定履约完成证据。"
    };
  }

  return null;
}
