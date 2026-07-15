/**
 * 「记一笔」三步向导状态机（纯逻辑，供 StepWizard 驱动）。
 * describe → confirm → done；只允许相邻前进、confirm 可回退、done 只能整体重置。
 */
import type { QuickDraft, QuickEntryStepKey } from "./types";
import { isDraftReadyForSubmit } from "./entry-rules";

export const QUICK_ENTRY_STEPS: ReadonlyArray<{ key: QuickEntryStepKey; title: string }> = [
  { key: "describe", title: "1 说清楚发生了什么" },
  { key: "confirm", title: "2 确认" },
  { key: "done", title: "3 完成" }
];

const STEP_ORDER: readonly QuickEntryStepKey[] = ["describe", "confirm", "done"];

/** 下一步（done 之后保持 done）。 */
export function getNextStep(step: QuickEntryStepKey): QuickEntryStepKey {
  const index = STEP_ORDER.indexOf(step);
  return STEP_ORDER[Math.min(index + 1, STEP_ORDER.length - 1)] ?? step;
}

/** 上一步（describe 之前保持 describe；done 不允许回退，需整体重置）。 */
export function getPrevStep(step: QuickEntryStepKey): QuickEntryStepKey {
  if (step === "done") return "done";
  const index = STEP_ORDER.indexOf(step);
  return STEP_ORDER[Math.max(index - 1, 0)] ?? step;
}

/** 能否从第 1 步进入确认：有白话描述或已有票据识别/文件即可（允许手填降级）。 */
export function canEnterConfirm(input: { hasText: boolean; hasFile: boolean }): boolean {
  return input.hasText || input.hasFile;
}

/** 能否从确认页提交：草稿字段齐备。 */
export function canSubmit(draft: QuickDraft): boolean {
  return isDraftReadyForSubmit(draft);
}

/** 请求前进：按当前步骤套用各自的放行条件，不满足则原地不动。 */
export function requestAdvance(
  step: QuickEntryStepKey,
  context: { hasText: boolean; hasFile: boolean; draft: QuickDraft }
): QuickEntryStepKey {
  if (step === "describe") {
    return canEnterConfirm(context) ? getNextStep(step) : step;
  }
  if (step === "confirm") {
    return canSubmit(context.draft) ? getNextStep(step) : step;
  }
  return step;
}
