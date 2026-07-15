/**
 * V7 L2 凭证效率线：状态 → 下一步动作、批量目标筛选、顺序批处理。
 * 纯函数 + 通用批处理 runner，无 UI 依赖，便于单测。
 */
import type { Voucher, VoucherStatus } from "@finance-taxation/domain-model";

export type VoucherTab = VoucherStatus | "all";

/** a 键 / 状态列共用的「下一步动作」。 */
export type VoucherNextAction = "validate_approve" | "post" | "none";

export const NEXT_ACTION_LABELS: Record<VoucherNextAction, string> = {
  validate_approve: "校验并审核",
  post: "过账",
  none: "流程完结",
};

/** 状态机：draft →（校验+审核）→ review_required →（过账）→ posted。 */
export function resolveNextAction(status: VoucherStatus): VoucherNextAction {
  if (status === "draft") return "validate_approve";
  if (status === "review_required") return "post";
  return "none";
}

export function filterVouchersByTab(vouchers: readonly Voucher[], tab: VoucherTab): Voucher[] {
  return tab === "all" ? [...vouchers] : vouchers.filter((voucher) => voucher.status === tab);
}

/** 凭证金额（借方合计），用于过账确认清单。 */
export function voucherAmount(voucher: Pick<Voucher, "lines">): number {
  return voucher.lines.reduce((sum, line) => {
    const debit = Number(line.debit);
    return sum + (Number.isFinite(debit) ? debit : 0);
  }, 0);
}

/** 凭证号短码，与列表/详情展示一致。 */
export function formatVoucherCode(id: string): string {
  return id.slice(-8).toUpperCase();
}

/** 勾选集合按状态拆分批量目标：draft 可批量审核，review_required 可批量过账。 */
export function splitBatchTargets(
  vouchers: readonly Voucher[],
  checkedIds: readonly string[]
): { approvable: Voucher[]; postable: Voucher[] } {
  const checkedSet = new Set(checkedIds);
  const checked = vouchers.filter((voucher) => checkedSet.has(voucher.id));
  return {
    approvable: checked.filter((voucher) => voucher.status === "draft"),
    postable: checked.filter((voucher) => voucher.status === "review_required"),
  };
}

export interface BatchProgress {
  done: number;
  total: number;
}

export interface BatchItemResult {
  id: string;
  ok: boolean;
  message: string;
}

/**
 * 顺序执行批量操作：单条失败不中断，逐条上报进度，最终返回成功/失败清单。
 */
export async function runSequentialBatch<T extends { id: string }>(
  items: readonly T[],
  worker: (item: T) => Promise<string | void>,
  onProgress?: (progress: BatchProgress) => void
): Promise<BatchItemResult[]> {
  const results: BatchItemResult[] = [];
  for (const [index, item] of items.entries()) {
    try {
      const message = await worker(item);
      results.push({ id: item.id, ok: true, message: message ?? "成功" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "操作失败";
      results.push({ id: item.id, ok: false, message });
    }
    onProgress?.({ done: index + 1, total: items.length });
  }
  return results;
}
