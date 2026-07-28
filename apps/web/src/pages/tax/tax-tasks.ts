/**
 * /tax 承载哪几件事（纯逻辑）。
 *
 * 改造前这一页把 13 个平级区块一次摊开（要滚 3.9 屏），其中只有「申报批次」和
 * 「底稿生成」是用户此刻真要动手的，其余是别的任务的入口、只读上下文和全局导航。
 * 这里把它们按「一次做一件事」重新归口，页面据此一次只渲染一件事的工作区。
 *
 * 角标一律用真实待办数（未结批次、逾期税种、未就绪事项），让该做的事自己浮上来。
 * 任务文案写在这里而不是组件里，是为了让「这页能办哪几件事」有单一事实来源，
 * 也方便直接单测。
 */
import type { TaxFilingBatch, TaxItem } from "@finance-taxation/domain-model";
import type { TaskDef } from "../../lib/task-focus";

export const TAX_TASK_KEYS = {
  declare: "declare",
  materials: "materials",
  calendar: "calendar",
  items: "items",
  profile: "profile",
  export: "export"
} as const;

export type TaxTaskKey = (typeof TAX_TASK_KEYS)[keyof typeof TAX_TASK_KEYS];

/** URL 上承载「当前在做哪件事」的查询参数名。 */
export const TAX_TASK_QUERY_KEY = "task";

/** 未走完申报流程的批次：这些才是「还要办」的。 */
export function countOpenBatches(batches: readonly TaxFilingBatch[]): number {
  return batches.filter(
    (batch) => batch.status === "draft" || batch.status === "review_required" || batch.status === "ready"
  ).length;
}

/** 还没准备好的税务事项：它们会挡住批次校验。 */
export function countUnreadyItems(items: readonly TaxItem[]): number {
  return items.filter((item) => item.status !== "ready").length;
}

export interface TaxTaskInput {
  batches: readonly TaxFilingBatch[];
  items: readonly TaxItem[];
  /** 本期已逾期的税种数，来自 tax-obligations.ts。 */
  overdueCount: number;
}

/**
 * 任务顺序固定按声明顺序，不按角标排序：切换器的位置一变，
 * 用户上一秒记住的「第三个是日历」下一秒就不成立了，
 * 数据异步到达时标签还会在鼠标底下跳。紧急程度交给角标表达。
 */
export function buildTaxTasks({ batches, items, overdueCount }: TaxTaskInput): TaskDef[] {
  return [
    {
      key: TAX_TASK_KEYS.declare,
      label: "申报这个月的税",
      description: "按批次把本期该报的税走完：校验、提交、复核、留档，一步一步来。",
      badge: countOpenBatches(batches)
    },
    {
      key: TAX_TASK_KEYS.materials,
      label: "准备申报材料",
      description: "按税种生成申报要用的计算表和资料清单，算错了在这里改，改完回上一件事提交。"
    },
    {
      key: TAX_TASK_KEYS.calendar,
      label: "看到期与提醒",
      description: "本期各税种什么时候截止、报没报，逾期的排在最前面。",
      badge: overdueCount
    },
    {
      key: TAX_TASK_KEYS.items,
      label: "查税务事项",
      description: "查每一笔业务算出来的税务处理结果，以及它挂在哪个经营事项上。",
      badge: countUnreadyItems(items)
    },
    {
      key: TAX_TASK_KEYS.profile,
      label: "维护纳税人身份与税率",
      description: "设定公司的纳税人身份、申报频率和适用税率，低频维护，改动会影响后续所有计算。"
    },
    {
      key: TAX_TASK_KEYS.export,
      label: "导出申报文件",
      description: "生成上传电子税务局用的申报文件，并登记回执流水号。"
    }
  ];
}
