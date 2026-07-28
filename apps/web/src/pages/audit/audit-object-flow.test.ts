import {
  AUDITED_SEQUENCES,
  buildAuditTrailFlow,
  hasAuditedSequence,
  type AuditFlowLog
} from "./audit-object-flow";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function log(action: string, resourceId: string | null = "vch-1"): AuditFlowLog {
  return { action, resourceId };
}

const COMPLETE_PAGE = { total: 3, limit: 50, offset: 0 };

// ── 步骤来自真实字段：done 只看该对象的日志里有没有那个 action ─────────────────

{
  const flow = buildAuditTrailFlow({
    resourceType: "voucher",
    resourceId: "vch-1",
    logs: [log("approve")],
    ...COMPLETE_PAGE
  });
  assert(flow, "凭证有后端强制的 approve → post 顺序，应该给出流程");
  assert(flow.steps.length === 2, "凭证流程只有两步");
  assert(flow.steps[0]?.status === "done", "有 approve 记录 → 审核已办完");
  assert(flow.steps[1]?.status === "current", "没有 post 记录 → 过账是现在这步");
  assert(flow.overall === "in_progress", "还没过账，整体在办理中");
}

{
  const flow = buildAuditTrailFlow({
    resourceType: "voucher",
    resourceId: "vch-1",
    logs: [log("approve"), log("post")],
    ...COMPLETE_PAGE
  });
  assert(flow?.overall === "done", "审核 + 过账都有记录 → 全流程办完");
}

// 别的对象的日志不能算到这个对象头上。
{
  const flow = buildAuditTrailFlow({
    resourceType: "voucher",
    resourceId: "vch-1",
    logs: [log("approve", "vch-2"), log("post", "vch-2")],
    ...COMPLETE_PAGE
  });
  assert(flow?.steps[0]?.status === "current", "同类型别的凭证的记录不得算作本凭证已办完");
}

// ── 刻意不画的步骤：没有支撑字段就不画 ───────────────────────────────────────

{
  // 后端对 voucher 只写 approve / post / reverse，建单不写审计日志。
  const labels = AUDITED_SEQUENCES.voucher?.map((step) => step.label) ?? [];
  assert(
    !labels.some((label) => label.includes("创建") || label.includes("新建")),
    "凭证没有 create 审计记录，绝不能画「创建凭证」这一步（会永远停在第一步）"
  );
  assert(
    !AUDITED_SEQUENCES.voucher?.some((step) => step.actions.includes("reverse")),
    "冲红是对已过账凭证的纠错，不是流程的第三步"
  );
}

{
  // 只有后端强制先后顺序的三类才画流程；其余是并列事件流，不是流程。
  assert(Object.keys(AUDITED_SEQUENCES).sort().join(",") === "payroll,payroll_transfer_batch,voucher",
    "只有 voucher / payroll / payroll_transfer_batch 有后端强制顺序");

  for (const resourceType of ["business_event", "contract", "export_job", "invoice", "task", "knowledge_item"]) {
    assert(!hasAuditedSequence(resourceType), `${resourceType} 的审计动作之间没有强制先后，不得画成流程`);
    assert(
      buildAuditTrailFlow({ resourceType, resourceId: "x-1", logs: [log("create", "x-1")], ...COMPLETE_PAGE }) === null,
      `${resourceType} 不该给出流程条`
    );
  }

  // 后端一条审计日志都不写的类型，连事件流都没有。
  for (const resourceType of ["document", "tax_item", "risk_finding"]) {
    assert(!hasAuditedSequence(resourceType), `${resourceType} 后端不写审计日志，不得画流程`);
  }
}

// ── 不完整的日志集合宁可不给：一条骗人的流程条比没有更糟 ──────────────────────

{
  // 命中数超过一页：approve 那条完全可能落在第二页，此时按屏上数据推导会把一张
  // 已过账的凭证画成「还没审核」。
  const flow = buildAuditTrailFlow({
    resourceType: "voucher",
    resourceId: "vch-1",
    logs: [log("post")],
    total: 80,
    limit: 50,
    offset: 0
  });
  assert(flow === null, "命中数超过一页时不得推导流程");
}

{
  const flow = buildAuditTrailFlow({
    resourceType: "voucher",
    resourceId: "vch-1",
    logs: [log("approve"), log("post")],
    total: 2,
    limit: 50,
    offset: 50
  });
  assert(flow === null, "翻到第二页时不得推导流程（第一页的记录已不在屏上）");
}

{
  const flow = buildAuditTrailFlow({
    resourceType: "voucher",
    resourceId: "",
    logs: [log("approve")],
    ...COMPLETE_PAGE
  });
  assert(flow === null, "没指定具体对象时流程的主语都不存在，不得画");
}

// ── 代发批次：四步顺序与后端状态机一致 ───────────────────────────────────────

{
  const batchLogs = [
    { action: "payroll.transfer.batch_built", resourceId: "batch-1" },
    { action: "payroll.transfer.batch_approved", resourceId: "batch-1" },
    { action: "payroll.transfer.file_generated", resourceId: "batch-1" }
  ];
  const flow = buildAuditTrailFlow({
    resourceType: "payroll_transfer_batch",
    resourceId: "batch-1",
    logs: batchLogs,
    total: 3,
    limit: 50,
    offset: 0
  });
  assert(flow?.steps.length === 4, "代发批次四步：生成 → 审批 → 导出 → 标记已发");
  assert(flow?.steps[3]?.status === "current", "还没标记已发 → 停在最后一步");
  assert(flow?.nextStepKey === "disbursed", "下一步是标记已代发");
}

// ── 不伪造对象级链接 ────────────────────────────────────────────────────────

{
  const flow = buildAuditTrailFlow({
    resourceType: "payroll",
    resourceId: "payroll-2026-06",
    logs: [{ action: "compute", resourceId: "payroll-2026-06" }],
    total: 1,
    limit: 50,
    offset: 0
  });
  assert(flow, "工资期间有 compute → confirm 的强制顺序");
  assert(
    flow.steps.every((step) => step.related === undefined),
    "流程的主语就是当前这个对象，不得把它自己挂成每一步的关联链接；" +
      "employee / payroll / export_job 等类型 EntityLink 也不支持，硬挂只会造出点不动的链接"
  );
}
