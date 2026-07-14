/**
 * 月结编排状态机 — 前端视图类型。
 *
 * 注：apps/web/src/lib/api.ts 中存在两个同名 `CloseStep` 导出（旧的静态
 * checklist 类型与新的编排状态机类型），interface 合并导致 `status` 字段类型
 * 冲突（tsc TS2717），属于该文件自身的既有问题。本页面不允许改动 lib/api.ts，
 * 因此在这里独立声明与后端 close-plan.ts 语义一致的视图类型，避免依赖那个
 * 有歧义的合并类型；从 getClosePlan 返回值 as 转换过来即可。
 */

export type ClosePlanStepStatus = "blocked" | "ready" | "in_review" | "done";

export interface ClosePlanStepView {
  key: string;
  label: string;
  status: ClosePlanStepStatus;
  blockingReason?: string;
}

export type ClosePlanOverall = "not_started" | "in_progress" | "blocked" | "completed";

export interface ClosePlanView {
  steps: ClosePlanStepView[];
  nextActionableStep: string | null;
  overall: ClosePlanOverall;
}
