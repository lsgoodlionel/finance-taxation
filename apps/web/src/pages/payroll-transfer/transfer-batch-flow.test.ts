import {
  buildTransferBatchFlow,
  buildTransferBatchFlowTitle,
  resolveTransferBlockedReason
} from "./transfer-batch-flow";
import type { PayrollTransferBatch } from "../../lib/api";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/** 造一个批次；只覆盖流程真正读的字段，其余用最小占位。 */
function batch(overrides: Partial<PayrollTransferBatch> = {}): PayrollTransferBatch {
  return {
    id: "batch-1",
    payroll_period: "2026-05",
    total_amount: "100000.00",
    employee_count: 10,
    status: "draft",
    retry_count: 0,
    last_error: null,
    last_attempt_at: null,
    next_retry_at: null,
    compensation_status: "not_required",
    compensation_event_id: null,
    compensated_at: null,
    bank_transfer_ref: null,
    notes: "",
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
    ...overrides
  };
}

function statusOf(flow: ReturnType<typeof buildTransferBatchFlow>, key: string) {
  return flow?.steps.find((step) => step.key === key)?.status ?? null;
}

// ── 没选中批次就不画流程条（空条比没有更糟：它会暗示存在一笔）───────────────
{
  assert(buildTransferBatchFlow(null) === null, "没有批次时不得返回空流程");
  assert(buildTransferBatchFlowTitle(null) === "这笔代发走到哪了", "无批次时给通用标题");
  assert(
    buildTransferBatchFlowTitle(batch()) === "这笔代发走到哪了 · 2026-05",
    "标题要带上批次期间，避免和全站导航条混淆"
  );
}

// ── 步骤全部由真实字段推导，且每一步都有出处 ────────────────────────────────
{
  const flow = buildTransferBatchFlow(batch());
  assert(flow, "有批次就该有流程");
  assert(
    flow.steps.map((step) => step.key).join(",") === "approve,export,disburse,compensate,confirm",
    "步骤顺序必须与后端状态机一致"
  );
  // 「生成批次」不列为步骤：批次存在本身就说明它做完了，永远 ✓ 的步骤只占位置。
  assert(!flow.steps.some((step) => step.key === "generate"), "不得把「生成批次」画成一步");
  assert(flow.steps.every((step) => Boolean(step.owner)), "每一步都要说清由谁办");
}

// ── status 决定前三步与最后一步 ─────────────────────────────────────────────
{
  const draft = buildTransferBatchFlow(batch({ status: "draft" }));
  assert(statusOf(draft, "approve") === "current", "草稿批次当前应停在审批");
  assert(statusOf(draft, "export") === "pending", "审批没过，导出不该让用户动手");
  assert(draft?.nextStepKey === "approve", "下一步就是审批");

  const exported = buildTransferBatchFlow(batch({ status: "exported" }));
  assert(statusOf(exported, "approve") === "done", "已导出蕴含已审批");
  assert(statusOf(exported, "export") === "done", "已导出这步应为已办完");
  assert(statusOf(exported, "disburse") === "current", "接下来等银行代发");

  const disbursed = buildTransferBatchFlow(
    batch({ status: "disbursed", compensation_status: "completed", compensation_event_id: "evt-pay-1" })
  );
  assert(statusOf(disbursed, "compensate") === "done", "补偿已完成则回写这步办完");
  assert(statusOf(disbursed, "confirm") === "current", "剩下的是银行回单对账");

  const confirmed = buildTransferBatchFlow(
    batch({ status: "confirmed", compensation_status: "completed", compensation_event_id: "evt-pay-1" })
  );
  assert(confirmed?.overall === "done", "对账完成且补偿完成 = 全流程走完");
  assert(confirmed?.nextStepKey === null, "全部完成时没有下一步");
}

// ── 补偿失败：不能显示成「全部办完」，且要把后端真实报错端上来 ──────────────
{
  const failed = buildTransferBatchFlow(
    batch({ status: "confirmed", compensation_status: "failed", last_error: "事项写入超时" })
  );
  assert(failed?.overall === "blocked", "补偿失败的批次不得整条显示成办完");
  assert(statusOf(failed, "compensate") === "blocked", "卡住的是回写经营事项这一步");
  const hint = failed?.steps.find((step) => step.key === "compensate")?.hint ?? "";
  assert(hint.includes("事项写入超时"), "卡住原因要带上后端写入的 last_error，而不是笼统一句失败");

  // last_error 为空也要给得出话来，不能显示 undefined。
  const failedWithoutError = buildTransferBatchFlow(
    batch({ status: "disbursed", compensation_status: "failed" })
  );
  const fallbackHint = failedWithoutError?.steps.find((step) => step.key === "compensate")?.hint ?? "";
  assert(fallbackHint.length > 0 && !fallbackHint.includes("undefined"), "缺少 last_error 时要有兜底文案");

  const pending = buildTransferBatchFlow(batch({ status: "disbursed", compensation_status: "pending" }));
  assert(statusOf(pending, "compensate") === "blocked", "补偿还没跑完同样算卡住");
  assert(resolveTransferBlockedReason(batch({ compensation_status: "completed" })) === null, "补偿完成不算卡住");
  assert(resolveTransferBlockedReason(batch({ compensation_status: "not_required" })) === null, "还没到补偿这步不算卡住");
}

// ── 关联对象：只在字段真有值时给链接，绝不伪造 ──────────────────────────────
{
  const withEvent = buildTransferBatchFlow(
    batch({ status: "disbursed", compensation_status: "completed", compensation_event_id: "evt-pay-9" })
  );
  const related = withEvent?.steps.find((step) => step.key === "compensate")?.related ?? [];
  assert(related.length === 1, "回写成功时应挂上那条经营事项");
  assert(related[0]?.kind === "business_event" && related[0]?.id === "evt-pay-9", "关联对象必须是真实的事项 id");

  // 批次本身、银行流水号都没有可跳转的目标页，不能凭空造链接。
  const withoutEvent = buildTransferBatchFlow(batch({ status: "exported", bank_transfer_ref: "REF-001" }));
  const allRelated = (withoutEvent?.steps ?? []).flatMap((step) => step.related ?? []);
  assert(allRelated.length === 0, "compensation_event_id 为空时一个关联对象都不该有");
}

console.log("transfer-batch-flow-ok");
