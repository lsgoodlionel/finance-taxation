import type { RiskClosureRecord, RiskFinding } from "@finance-taxation/domain-model";
import { resolveActiveTask, resolveTaskByArrowKey } from "../../lib/task-focus";
import { buildRiskTasks, countOpenFindings, RISK_TASK_KEYS } from "./risk-tasks";
import { buildRiskFindingFlow } from "./risk-finding-flow";
import { readRiskUrlState, writeRiskUrlState } from "./risk-url-state";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function makeFinding(overrides: Partial<RiskFinding> = {}): RiskFinding {
  return {
    id: "RSK-1",
    companyId: "C-1",
    businessEventId: "EVT-1",
    ruleCode: "R-001",
    severity: "medium",
    status: "open",
    title: "发票与合同金额不一致",
    detail: "差额 1200 元",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides
  };
}

function makeClosure(findingId: string): RiskClosureRecord {
  return {
    id: "CLS-1",
    companyId: "C-1",
    findingId,
    closedByUserId: null,
    closedByName: "李四",
    resolution: "已补合同附件",
    reviewedAt: "2026-07-02T00:00:00.000Z"
  };
}

// ── 任务划分 ────────────────────────────────────────────────────────────────
{
  const findings = [
    makeFinding({ id: "RSK-1", status: "open" }),
    makeFinding({ id: "RSK-2", status: "resolved" }),
    makeFinding({ id: "RSK-3", status: "open" })
  ];
  assert(countOpenFindings(findings) === 2, "expected two open findings");

  const tasks = buildRiskTasks(countOpenFindings(findings));
  assert(tasks.length === 3, "expected three tasks on /risk");
  assert(tasks[0]?.key === RISK_TASK_KEYS.findings, "expected 处理风险发现 to lead");
  assert(tasks[0]?.badge === 2, "expected the badge to carry the real open count");
  // 扫描类任务拿不到真实待办数，就不许挂角标
  assert(tasks[1]?.badge === undefined, "consistency task must not fake a badge");
  assert(tasks[2]?.badge === undefined, "anomaly task must not fake a badge");
  assert(
    tasks.every((task) => typeof task.description === "string" && task.description.length > 0),
    "every task needs a one-line explanation"
  );
}

// ── URL 同步：可刷新、可分享 ─────────────────────────────────────────────────
{
  const tasks = buildRiskTasks(0);

  assert(
    resolveActiveTask(tasks, readRiskUrlState(new URLSearchParams("?task=anomaly")).task) === "anomaly",
    "URL 指定的任务应被选中"
  );
  assert(
    resolveActiveTask(tasks, readRiskUrlState(new URLSearchParams("")).task) === RISK_TASK_KEYS.findings,
    "没写 task 时应回落到主任务"
  );
  assert(
    resolveActiveTask(tasks, readRiskUrlState(new URLSearchParams("?task=nope")).task) === RISK_TASK_KEYS.findings,
    "非法 task 应回落到主任务而不是空白页"
  );

  const written = writeRiskUrlState({
    scope: "all",
    eventId: "",
    findingId: "RSK-1",
    view: "all",
    task: "consistency"
  });
  assert(written.get("task") === "consistency", "选中的任务要写回 URL");
  assert(written.get("finding") === "RSK-1", "任务切换不应丢掉已选中的风险");
  assert(readRiskUrlState(written).task === "consistency", "URL 读写应可往返");

  const defaultTask = writeRiskUrlState({
    scope: "all",
    eventId: "",
    findingId: "",
    view: "all",
    task: ""
  });
  assert(defaultTask.toString() === "", "默认状态不该往 URL 里塞噪音");

  // 键盘导航仍由共享逻辑负责，这里确认任务列表能被它正确遍历
  assert(
    resolveTaskByArrowKey(tasks, RISK_TASK_KEYS.findings, "ArrowRight") === RISK_TASK_KEYS.consistency,
    "方向键应在任务间移动"
  );
}

// ── 风险生命周期：真实字段驱动，不再硬编码 ──────────────────────────────────
{
  const empty = buildRiskFindingFlow({ finding: null, closureRecords: [] });
  assert(empty.steps.length === 0, "没选中风险时不画流程");

  const open = buildRiskFindingFlow({ finding: makeFinding(), closureRecords: [] });
  assert(open.steps.length === 3, "风险生命周期只有三步");
  assert(open.steps[0]?.status === "done", "风险已被发现");
  assert(open.nextStepKey === "remediate", "下一步是回上游整改");
  assert(
    open.steps[0]?.related?.[0]?.kind === "business_event",
    "发现这一步要能跳回关联事项"
  );

  const highRisk = buildRiskFindingFlow({
    finding: makeFinding({ severity: "high" }),
    closureRecords: []
  });
  assert(highRisk.overall === "blocked", "高危未整改应显示为卡住");
  assert(
    highRisk.steps[1]?.hint?.includes("高危") === true,
    "应说明为什么卡住"
  );

  const resolvedWithoutRecord = buildRiskFindingFlow({
    finding: makeFinding({ status: "resolved" }),
    closureRecords: []
  });
  assert(resolvedWithoutRecord.nextStepKey === "closed", "已整改但没留痕，最后一步还没完成");

  const closed = buildRiskFindingFlow({
    finding: makeFinding({ status: "resolved" }),
    closureRecords: [makeClosure("RSK-1")]
  });
  assert(closed.overall === "done", "整改并留痕后整条流程走完");
  assert(closed.nextStepKey === null, "走完就没有下一步");

  // 别的风险的关闭记录不能算到这一条头上
  const otherRecord = buildRiskFindingFlow({
    finding: makeFinding({ status: "resolved" }),
    closureRecords: [makeClosure("RSK-999")]
  });
  assert(otherRecord.overall !== "done", "不应把别条风险的关闭记录算进来");
}
