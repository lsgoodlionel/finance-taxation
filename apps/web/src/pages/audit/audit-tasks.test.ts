import {
  AUDIT_TASK_KEYS,
  AUDIT_TASK_QUERY_KEY,
  DEFAULT_AUDIT_TASK,
  buildAuditTasks,
  isAuditTaskKey,
  readAuditTask,
  writeAuditTask
} from "./audit-tasks";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

// ── 任务划分：两件事，且都说得出「在做什么」 ──────────────────────────────────

const tasks = buildAuditTasks({ chainBroken: false });

assert(tasks.length === 2, `expected exactly 2 audit tasks, got ${tasks.length}`);
assert(tasks[0]?.key === AUDIT_TASK_KEYS.trail, "查日志必须排在第一件事：它是这一页的主场景");
assert(tasks[1]?.key === AUDIT_TASK_KEYS.integrity, "验完整性排第二");
assert(
  tasks.every((task) => Boolean(task.label) && Boolean(task.description)),
  "每件事都要有名字和一句说明"
);

// 顺序固定，不按角标排序：位置一变用户的肌肉记忆就废了。
const brokenTasks = buildAuditTasks({ chainBroken: true });
assert(brokenTasks[0]?.key === AUDIT_TASK_KEYS.trail, "链断裂也不能把任务顺序换掉");

// ── 角标：只有「验出断裂」才是真待办 ─────────────────────────────────────────

assert(
  tasks.every((task) => task.badge === undefined),
  "没验过 / 验过没问题时，两件事都不该挂角标（挂了就是制造假紧迫感）"
);
assert(
  brokenTasks.find((task) => task.key === AUDIT_TASK_KEYS.integrity)?.badge === 1,
  "审计链断裂是事故，必须挂角标让它自己冒出来"
);
assert(
  buildAuditTasks({ chainBroken: false }).find((task) => task.key === AUDIT_TASK_KEYS.integrity)?.badge === undefined,
  "校验通过之后角标必须消失"
);

// ── URL 往返 ────────────────────────────────────────────────────────────────

assert(readAuditTask(new URLSearchParams()) === DEFAULT_AUDIT_TASK, "缺参数时回落到默认任务");
assert(readAuditTask(new URLSearchParams("task=integrity")) === "integrity", "URL 指定的任务优先");
assert(readAuditTask(new URLSearchParams("task=nope")) === DEFAULT_AUDIT_TASK, "非法取值回落到默认任务");
assert(!isAuditTaskKey("nope"), "非法 key 必须被拒绝");
assert(isAuditTaskKey(AUDIT_TASK_KEYS.integrity), "合法 key 必须被接受");

// 切任务不能把用户刚筛好的条件冲掉 —— 这一页的过滤条件全在 URL 上。
{
  const params = new URLSearchParams(
    "resourceType=voucher&resourceId=vch-1&from=2026-01-01&to=2026-01-31&offset=50&log=log-9&expanded=log-9"
  );
  const next = writeAuditTask(params, AUDIT_TASK_KEYS.integrity);

  assert(next.get(AUDIT_TASK_QUERY_KEY) === "integrity", "任务要写进 URL");
  for (const key of ["resourceType", "resourceId", "from", "to", "offset", "log", "expanded"]) {
    assert(next.get(key) === params.get(key), `切换任务不得丢掉检索状态：${key}`);
  }
  assert(params.get(AUDIT_TASK_QUERY_KEY) === null, "writeAuditTask 不得就地修改入参");
}
