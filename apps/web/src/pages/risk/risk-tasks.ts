/**
 * /risk 承载的三件事。
 *
 * 改造前这一页把 10 个区块平铺在一屏：处置风险发现的列表/工作台/时间轴，加上
 * 票税一致性比对和异常扫描——后两者是各自带属期选择器和结果表的**独立扫描任务**，
 * 和「关掉手上这条风险」毫无关系，却和它抢同一屏。
 *
 * 现在按「一次只做一件事」拆开：主任务是处置风险发现，另外两件收进任务切换器。
 * 选中的任务写进 URL（?task=），可刷新、可分享、可前进后退。
 */
import type { RiskFinding } from "@finance-taxation/domain-model";
import type { TaskDef } from "../../lib/task-focus";

export const RISK_TASK_KEYS = {
  findings: "findings",
  consistency: "consistency",
  anomaly: "anomaly"
} as const;

export type RiskTaskKey = (typeof RISK_TASK_KEYS)[keyof typeof RISK_TASK_KEYS];

/** 待处理 = 还没关闭的风险发现。角标要的就是这个数，不能拿总数充数。 */
export function countOpenFindings(findings: readonly RiskFinding[]): number {
  return findings.filter((finding) => finding.status === "open").length;
}

/**
 * 构造任务列表。
 *
 * 只有「处置风险发现」挂角标：它的待办数当前页就有。票税比对与异常扫描的结果
 * 由各自面板按属期现拉，页面这一层拿不到真实待办数——与其挂一个猜的数字，
 * 不如不挂（角标存在的意义就是可信）。
 */
export function buildRiskTasks(openFindingCount: number): TaskDef[] {
  return [
    {
      key: RISK_TASK_KEYS.findings,
      label: "处理风险发现",
      description: "逐条看系统扫出来的疑点：回上游整改，然后在这里关闭并留下复盘记录。",
      badge: openFindingCount
    },
    {
      key: RISK_TASK_KEYS.consistency,
      label: "票税一致性比对",
      description: "按属期比对发票值与账面/申报值，找出对不上的金额。"
    },
    {
      key: RISK_TASK_KEYS.anomaly,
      label: "异常扫描",
      description: "按规则扫重复付款、断号发票、周末大额、税负突变，供人工复核。"
    }
  ];
}
