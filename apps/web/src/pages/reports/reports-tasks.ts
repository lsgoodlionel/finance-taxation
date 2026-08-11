/**
 * /reports 承载哪几件事（纯逻辑）。
 *
 * 改造前这一页把 8 个平级区块一次摊开：侧栏里「选期间」「选看哪张表」「做快照对比」
 * 「打包导出」四件性质完全不同的事挤在一起，右侧再叠一张结果卡和一张报表面板。
 * 用户打开页面看到的是「报表模块能做什么」，而不是「我现在要看什么」。
 *
 * 现在按「一次只做一件事」归口成四件事：看结论、看三张报表、对比两期、对预算。
 * 「选期间」不在其中——它是这四件事共用的上下文，收进页头一行；
 * 「打包导出」也不在其中——月结/审计/稽核资料包在 /export-center 有等价能力
 * （见 pages/export-center/ReportsAndPackagesCards.tsx），本页不再重复一份。
 */
import type { TaskDef } from "../../lib/task-focus";
import type { ReportsWorkbenchView } from "./report-types";

export const REPORTS_TASK_KEYS = {
  /** 白话结论：老板摘要。 */
  chairman: "chairman",
  /** 三张法定报表：资产负债表 / 利润表 / 现金流量表。 */
  statements: "statements",
  /** 两期对比：保存/挑选快照，生成差异分析。 */
  compare: "compare",
  /** 预算差异。 */
  budget: "budget"
} as const;

export type ReportsTaskKey = (typeof REPORTS_TASK_KEYS)[keyof typeof REPORTS_TASK_KEYS];

/**
 * 「看报表」这件事内部可切换的几张表。
 *
 * 前三张是法定报表，第四张「部门费用」是管理口径（V12-D1）——它不对外报送，
 * 但和三张表看的是同一期数据，放在同一个切换器里最符合"我现在要看什么"的直觉，
 * 强行分到另一件事只会让用户为看一眼费用多点两次。
 */
export const STATEMENT_VIEWS: readonly ReportsWorkbenchView[] = [
  "balanceSheet",
  "profitStatement",
  "cashFlow",
  "costCenter"
];

const TASK_DEFS: Record<ReportsTaskKey, TaskDef> = {
  [REPORTS_TASK_KEYS.chairman]: {
    key: REPORTS_TASK_KEYS.chairman,
    label: "先看这期结论",
    description: "把本期经营情况讲成白话：赚没赚钱、钱够不够、哪里要留意。"
  },
  [REPORTS_TASK_KEYS.statements]: {
    key: REPORTS_TASK_KEYS.statements,
    label: "看报表",
    description: "本期法定报表（家底、赚钱、现金）与部门费用，可切表、可看图。"
  },
  [REPORTS_TASK_KEYS.compare]: {
    key: REPORTS_TASK_KEYS.compare,
    label: "对比两期变化",
    description: "先存下本期报表，再挑两期做差异分析，看哪些科目动了。"
  },
  [REPORTS_TASK_KEYS.budget]: {
    key: REPORTS_TASK_KEYS.budget,
    label: "对预算",
    description: "把实际数和预算数摆在一起，看超支和结余。"
  }
};

/**
 * 任务顺序按角色排：guided 先给结论，pro 先给三表——与改造前两种模式的首屏落点一致。
 * 顺序在同一模式内是固定的（不按角标重排），避免标签在鼠标底下跳。
 */
export function buildReportsTasks(mode: "guided" | "pro"): TaskDef[] {
  const order: ReportsTaskKey[] =
    mode === "guided"
      ? [REPORTS_TASK_KEYS.chairman, REPORTS_TASK_KEYS.statements, REPORTS_TASK_KEYS.compare, REPORTS_TASK_KEYS.budget]
      : [REPORTS_TASK_KEYS.statements, REPORTS_TASK_KEYS.compare, REPORTS_TASK_KEYS.budget, REPORTS_TASK_KEYS.chairman];
  return order.map((key) => TASK_DEFS[key]);
}

/** V7 K3 保留：guided 进本页先落白话结论，pro 仍落三表工作台。 */
export function resolveInitialReportsTask(mode: "guided" | "pro"): ReportsTaskKey {
  return mode === "guided" ? REPORTS_TASK_KEYS.chairman : REPORTS_TASK_KEYS.statements;
}

/** 当前展示的视图属于哪件事——面板由视图决定，切换器由任务决定，二者靠这张映射对齐。 */
export function resolveTaskByView(view: ReportsWorkbenchView): ReportsTaskKey {
  if (view === "chairman") return REPORTS_TASK_KEYS.chairman;
  if (view === "diff") return REPORTS_TASK_KEYS.compare;
  if (view === "budgetVariance") return REPORTS_TASK_KEYS.budget;
  return REPORTS_TASK_KEYS.statements;
}

/**
 * 切到某件事时该显示哪个视图。
 * 「看三张报表」回到上次看的那张表（默认资产负债表），别让用户每次都从头找。
 */
export function resolveViewByTask(
  task: string,
  lastStatementView: ReportsWorkbenchView = "balanceSheet"
): ReportsWorkbenchView {
  if (task === REPORTS_TASK_KEYS.chairman) return "chairman";
  if (task === REPORTS_TASK_KEYS.compare) return "diff";
  if (task === REPORTS_TASK_KEYS.budget) return "budgetVariance";
  return isStatementView(lastStatementView) ? lastStatementView : "balanceSheet";
}

export function isStatementView(view: ReportsWorkbenchView): boolean {
  return STATEMENT_VIEWS.includes(view);
}
