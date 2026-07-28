/**
 * 运行态/授权态是否需要用户现在就看。
 *
 * 一切正常时 WorkflowRuntimePanel 只是背景噪音（两张状态卡 + 若干统计块，内容却是
 * 「运行成功、无需授权」），不该占首屏；确有失败、待授权、权限不足或非 info 级异常时，
 * 它才是用户必须先处理的事。
 *
 * V10 收口：这条口径原先在 /tax、/tasks、/vouchers 三条车道各写一份——不是设计如此，
 * 而是当时各车道都不拥有共享层，只能靠人肉同步。口径稳定后上提到这里，三页共用一份。
 */
import type { WorkflowRuntimeSummary } from "./workflow-runtime";

export function needsRuntimeAttention(summary: WorkflowRuntimeSummary): boolean {
  return (
    summary.executionState === "failed" ||
    summary.authorizationState === "awaiting_authorization" ||
    summary.authorizationState === "insufficient" ||
    (summary.issue ? summary.issue.tone !== "info" : false)
  );
}
