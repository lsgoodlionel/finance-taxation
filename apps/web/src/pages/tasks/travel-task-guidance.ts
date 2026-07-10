import type { Task } from "@finance-taxation/domain-model";

export interface TravelTaskGuidance {
  tone: "warning" | "error";
  title: string;
  message: string;
}

export function deriveTravelTaskGuidance(tasks: Task[]): TravelTaskGuidance | null {
  const titles = new Set(tasks.map((task) => task.title));

  if (titles.has("核对重复差旅报销记录")) {
    return {
      tone: "error",
      title: "当前任务集对应疑似重复差旅报销",
      message: "建议先核对历史行程、票据和入账记录，再决定保留主链或关闭重复事项。"
    };
  }

  if (titles.has("拆分跨期差旅归属月份")) {
    return {
      tone: "warning",
      title: "当前任务集已切换到跨期差旅处理",
      message: "请按实际出差期间拆分归属月份，并分别复核认证抵扣和所得税归属期。"
    };
  }

  if (titles.has("补齐住宿发票与行程依据")) {
    return {
      tone: "warning",
      title: "当前任务集处于缺住宿票待补阶段",
      message: "补票前不应形成完整差旅过账和税务结论，建议先补齐住宿发票与行程依据。"
    };
  }

  return null;
}
