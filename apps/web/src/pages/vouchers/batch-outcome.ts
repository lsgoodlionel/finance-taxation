/**
 * V8 · 批量结果的呈现决策（纯函数，无 UI 依赖，便于单测）。
 *
 * 呈现诚实的两条底线：
 * 1) 服务端已经处理过的批次，其汇总必须无条件展示——列表刷新失败不得让结果凭空消失，
 *    否则用户会以为整批都失败，重新勾选再过一次账。
 * 2) 部分失败不给绿色成功提示：文案必须带上失败张数。
 */
import type { BatchItemResult } from "./voucher-actions";

export type BatchToastKind = "success" | "warning" | "error";

export interface BatchOutcome {
  succeededCount: number;
  failedCount: number;
  /** 汇总弹窗用成功样式还是警告样式。 */
  summaryTone: "success" | "warning";
  summaryTitle: string;
  toastKind: BatchToastKind;
  toastMessage: string;
}

export function buildBatchOutcome(
  label: string,
  results: readonly BatchItemResult[],
  buildSuccessToast: (count: number) => string
): BatchOutcome {
  const failedCount = results.filter((result) => !result.ok).length;
  const succeededCount = results.length - failedCount;
  const allSucceeded = failedCount === 0;

  if (succeededCount === 0) {
    return {
      succeededCount,
      failedCount,
      summaryTone: "warning",
      summaryTitle: `${label}完成：成功 0 张，失败 ${failedCount} 张`,
      toastKind: "error",
      toastMessage: `${label}未成功，请根据失败原因修正后重试`
    };
  }

  if (allSucceeded) {
    return {
      succeededCount,
      failedCount,
      summaryTone: "success",
      summaryTitle: `${label}完成：成功 ${succeededCount} 张`,
      toastKind: "success",
      toastMessage: buildSuccessToast(succeededCount)
    };
  }

  return {
    succeededCount,
    failedCount,
    summaryTone: "warning",
    summaryTitle: `${label}完成：成功 ${succeededCount} 张，失败 ${failedCount} 张`,
    toastKind: "warning",
    toastMessage: `${buildSuccessToast(succeededCount)}，另有 ${failedCount} 张失败，请查看汇总后重试`
  };
}

/** 列表刷新失败提示：结果已生效，只是列表没刷新——不能说成操作失败。 */
export function buildRefreshFailedMessage(label: string): string {
  return `${label}结果已生效，但列表刷新失败，请手动刷新页面查看最新状态`;
}
