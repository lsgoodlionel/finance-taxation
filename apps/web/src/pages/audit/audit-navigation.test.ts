import type { AuditLog } from "@finance-taxation/domain-model";
import { resolveAuditNavigationTarget } from "./audit-navigation";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function makeLog(resourceType: string, resourceId: string, changes: Record<string, unknown> | null = null): AuditLog {
  return {
    id: `log-${resourceType}`,
    companyId: "c-1",
    userId: "u-1",
    userName: "张会计",
    action: "create",
    resourceType,
    resourceId,
    resourceLabel: null,
    changes,
    createdAt: "2026-06-01T02:00:00.000Z"
  };
}

// ── 假链接 1：跳事项必须带查询参数，因为 EventsPage 根本不读 location.state ────

{
  const target = resolveAuditNavigationTarget(makeLog("business_event", "evt-1"));
  assert(target, "经营事项应当可回跳");
  assert(
    target.path === "/events?event=evt-1",
    `事项 id 必须带成查询参数，实际是 ${target.path}`
  );
  assert(target.state?.businessEventId === "evt-1", "state 一并保留，便于目标页后续接管");
}

// ── 假链接 2：导出任务定位不到，就别声称能「查看导出任务」 ────────────────────

{
  const target = resolveAuditNavigationTarget(makeLog("export_job", "job-1", { kind: "report" }));
  assert(target, "导出任务仍应给出入口");
  assert(
    target.label === "打开导出与归档中心",
    `文案要与它真正能做到的事一致，实际是 ${target.label}`
  );
  assert(!target.label.includes("查看导出任务"), "定位不到具体任务就不能这么写");
}

// ── 其余目标逐个验过都真的读 state，不得被顺手改坏 ───────────────────────────

{
  const voucher = resolveAuditNavigationTarget(makeLog("voucher", "vch-1"));
  assert(voucher?.path === "/vouchers", "凭证回跳路径不变");
  assert(voucher?.state?.voucherId === "vch-1", "VouchersPage 读 location.state.voucherId");

  const risk = resolveAuditNavigationTarget(makeLog("risk_finding", "rf-1"));
  assert(risk?.path === "/risk", "风险回跳路径不变");
  assert(risk?.state?.riskFindingId === "rf-1", "RiskPage 读 location.state.riskFindingId");

  const contract = resolveAuditNavigationTarget(makeLog("contract", "ct-1"));
  assert(contract?.path === "/contracts", "合同回跳路径不变");
}

// ── 没有 resourceId 时不造链接 ──────────────────────────────────────────────

{
  const orphan: AuditLog = { ...makeLog("business_event", "evt-1"), resourceId: null };
  assert(resolveAuditNavigationTarget(orphan) === null, "没有对象 id 就没有可跳的目标");
}

{
  assert(
    resolveAuditNavigationTarget(makeLog("company", "c-1")) === null,
    "没有对应业务页的类型不得凭空造一个跳转"
  );
}
