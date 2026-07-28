/**
 * 「当前这个代发批次走到哪了」的纯推导。
 *
 * 改造前用户只能从批次表里的一个状态 Tag（草稿 / 已审批 / 已导出 / 已代发 / 已对账）
 * 反推进度，看不出「下一步该谁做」，也看不出补偿失败时卡在什么上。
 *
 * 这里每一步的状态都来自批次的真实字段：
 * - 审批 / 导出 / 代发 / 对账：由 batch.status 在既定状态机上的位置决定；
 * - 卡住原因：补偿态 failed / pending 时取 last_error（后端写入的真实报错）；
 * - 关联对象：代发成功后回写的 compensation_event_id，可直接跳到经营事项。
 *
 * 状态推进规则（第一个未完成的是 current、其后一律 pending）由 lib/object-flow.ts
 * 的 buildObjectFlow 统一负责，本模块只回答「每一步做完没、卡在什么上」。
 */
import { buildObjectFlow, type FlowRelatedObject, type ObjectFlow } from "../../lib/object-flow";
import type { PayrollTransferBatch } from "../../lib/api";

type TransferStatus = PayrollTransferBatch["status"];

/** 状态机顺序：后一个状态蕴含前面所有步骤都已完成。 */
const STATUS_ORDER: readonly TransferStatus[] = ["draft", "approved", "exported", "disbursed", "confirmed"];

const OWNER_PAYROLL_STAFF = "工资专员";
const OWNER_APPROVER = "财务负责人";
const OWNER_CASHIER = "出纳";

function hasReached(status: TransferStatus, target: TransferStatus): boolean {
  return STATUS_ORDER.indexOf(status) >= STATUS_ORDER.indexOf(target);
}

/**
 * 批次当前卡在什么上。
 *
 * 只在补偿态确实异常时才返回原因：compensation_status 为 pending/failed 说明下游
 * 经营事项没写成，此时即使 status 看着往前走了，用户也需要先处理这个。
 */
export function resolveTransferBlockedReason(batch: PayrollTransferBatch): string | null {
  if (batch.compensation_status === "failed") {
    return batch.last_error
      ? `下游经营事项补偿失败：${batch.last_error}`
      : "下游经营事项补偿失败，需要重新补偿";
  }
  if (batch.compensation_status === "pending") {
    return "下游经营事项还没补偿完成，先在下方发起补偿";
  }
  return null;
}

/** 代发成功后回写的经营事项——「看到即可达」的唯一真实关联对象。 */
function buildRelatedEvent(batch: PayrollTransferBatch): FlowRelatedObject[] {
  if (!batch.compensation_event_id) {
    return [];
  }
  return [{ kind: "business_event", id: batch.compensation_event_id, label: batch.compensation_event_id }];
}

/**
 * 由批次推导流程视图；没有选中批次时返回 null（页面据此不画空条）。
 *
 * 刻意不把「生成批次」列为第一步：批次对象存在本身就说明这步做完了，
 * 一个永远是 ✓ 的步骤只会占位置。
 */
export function buildTransferBatchFlow(batch: PayrollTransferBatch | null): ObjectFlow | null {
  if (!batch) {
    return null;
  }

  const blockedReason = resolveTransferBlockedReason(batch);

  return buildObjectFlow([
    {
      key: "approve",
      label: "审批批次",
      done: hasReached(batch.status, "approved"),
      owner: OWNER_APPROVER
    },
    {
      key: "export",
      label: "导出银行文件",
      done: hasReached(batch.status, "exported"),
      owner: OWNER_PAYROLL_STAFF
    },
    {
      key: "disburse",
      label: "银行代发到账",
      done: hasReached(batch.status, "disbursed"),
      // 补偿异常只可能发生在代发这一步之后（事项是代发时联动生成的），
      // 挂在这里才对得上用户看到的报错。
      blockedReason: hasReached(batch.status, "disbursed") ? null : blockedReason,
      related: buildRelatedEvent(batch),
      owner: OWNER_CASHIER
    },
    {
      key: "confirm",
      label: "银行回单对账",
      done: hasReached(batch.status, "confirmed"),
      blockedReason: hasReached(batch.status, "disbursed") ? blockedReason : null,
      owner: OWNER_CASHIER
    }
  ]);
}

/** 流程条标题：带上批次期间，避免和全站导航条混淆。 */
export function buildTransferBatchFlowTitle(batch: PayrollTransferBatch | null): string {
  if (!batch) {
    return "这笔代发走到哪了";
  }
  return `这笔代发走到哪了 · ${batch.payroll_period}`;
}
