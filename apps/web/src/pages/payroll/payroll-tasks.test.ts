import {
  buildPayrollTasks,
  DEFAULT_PAYROLL_TASK,
  isPayrollTaskKey,
  isTransferSideTask,
  PAYROLL_TASK_KEYS,
  readPayrollTask,
  resolvePayrollTaskFromNav,
  writePayrollTask,
  type PayrollTaskKey
} from "./payroll-tasks";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

// ── URL 同步：?task= 决定当前在做哪件事 ──────────────────────────────────────
{
  assert(readPayrollTask(new URLSearchParams()) === DEFAULT_PAYROLL_TASK, "缺省应落在「算这个月的工资」");
  assert(readPayrollTask(new URLSearchParams("task=policy")) === "policy", "URL 指定的合法任务应生效");
  assert(
    readPayrollTask(new URLSearchParams("task=nope")) === DEFAULT_PAYROLL_TASK,
    "非法任务名应回落到默认，而不是渲染空工作区"
  );

  // 写任务不能顺手丢掉别的查询参数。
  const written = writePayrollTask(new URLSearchParams("period=2026-05"), "employees");
  assert(written.get("task") === "employees", "写入后 task 应为 employees");
  assert(written.get("period") === "2026-05", "写入任务不得丢掉既有查询参数");

  // 纯函数不得就地改调用方的 params。
  const original = new URLSearchParams("task=run");
  writePayrollTask(original, "social");
  assert(original.get("task") === "run", "writePayrollTask 必须返回新对象，不改入参");
}

// ── 旧深链：/payroll/transfer → ?tab=transfer 必须继续认 ────────────────────
{
  // App.tsx 把 /payroll/transfer 重定向成 ?tab=transfer，收件箱里也还留着这个链接。
  assert(readPayrollTask(new URLSearchParams("tab=transfer")) === "transfer", "旧的 ?tab=transfer 应落到「发这个月的工资」");
  assert(readPayrollTask(new URLSearchParams("tab=manage")) === "run", "旧的 ?tab=manage 应落到「算这个月的工资」");
  assert(readPayrollTask(new URLSearchParams("tab=unknown")) === DEFAULT_PAYROLL_TASK, "旧参数取值非法时回落默认");

  // 新参数优先，且写入时必须把旧参数清掉——两个参数同时挂着，下一次读就有歧义。
  assert(readPayrollTask(new URLSearchParams("tab=transfer&task=policy")) === "policy", "新参数优先于旧参数");
  const normalized = writePayrollTask(new URLSearchParams("tab=transfer"), "transfer");
  assert(normalized.get("task") === "transfer", "归一后应写上 task");
  assert(!normalized.has("tab"), "归一后必须删掉旧的 tab 参数");
}

// ── 跳转落点：推不出来就交回给 URL / 默认值，不要把用户按在某件事上 ────────
{
  assert(
    resolvePayrollTaskFromNav({ resourceType: "payroll_transfer_batch" }) === "transfer",
    "钻取代发批次应落到「发这个月的工资」"
  );
  assert(resolvePayrollTaskFromNav({ tab: "employees" }) === "employees", "审计跳转 tab=employees 落到员工档案");
  assert(resolvePayrollTaskFromNav({ employeeId: "emp-1" }) === "employees", "带员工 id 落到员工档案");
  assert(resolvePayrollTaskFromNav({ tab: "payroll" }) === "run", "审计跳转 tab=payroll 落到算工资");
  assert(resolvePayrollTaskFromNav({ payrollPeriod: "2026-05" }) === "run", "带工资期间落到算工资");
  assert(resolvePayrollTaskFromNav({ businessEventId: "evt-1" }) === "run", "带工资事项落到算工资");
  assert(resolvePayrollTaskFromNav({}) === null, "没有定位信息时不得替用户选一件事");
  assert(
    resolvePayrollTaskFromNav({ resourceType: "payroll_transfer_batch", tab: "employees" }) === "transfer",
    "批次这种明确的对象定位优先于泛泛的 tab 提示"
  );
}

// ── 任务划分：五件事、顺序按一个月的推进次序、不挂假角标 ────────────────────
{
  const tasks = buildPayrollTasks();
  assert(tasks.length === 5, `expected 5 payroll tasks, got ${tasks.length}`);
  assert(
    tasks.map((task) => task.key).join(",") === "run,transfer,social,employees,policy",
    "任务顺序固定按「算 → 发 → 关账 → 台账 → 参数」，不按紧急度重排"
  );
  assert(tasks.every((task) => Boolean(task.description)), "每件事都要有一句说明");
  // 角标要么来自本页已加载的数据，要么就是假的：工资待办分散在两个子页面的 hook 里，
  // 而子页面只在被选中时才挂载，别的任务上永远读不到真值，所以一律不挂。
  assert(tasks.every((task) => task.badge === undefined), "工资任务一律不挂角标");
  assert(
    tasks.every((task) => /[算发做维设]/.test(task.label)),
    "任务名要用动词短语（做什么），不是视图名"
  );
}

// ── 任务 key 守卫与页面归属：五个 key 必须被两个子页面刚好瓜分完 ────────────
{
  assert(isPayrollTaskKey("run"), "run 是合法任务");
  assert(!isPayrollTaskKey("payroll"), "旧的 tab key「payroll」不是任务 key");
  assert(!isPayrollTaskKey("manage"), "旧的域 tab key「manage」不是任务 key");
  assert(!isPayrollTaskKey(null), "null 不是合法任务");

  const allKeys = buildPayrollTasks().map((task) => task.key as PayrollTaskKey);
  const transferSide = allKeys.filter(isTransferSideTask);
  const manageSide = allKeys.filter((key) => !isTransferSideTask(key));
  assert(
    transferSide.join(",") === `${PAYROLL_TASK_KEYS.transfer},${PAYROLL_TASK_KEYS.social}`,
    "只有代发与社保关账由 PayrollTransferPage 承载"
  );
  assert(manageSide.length === 3, "其余三件由 PayrollPage 承载，两边加起来必须覆盖全部任务");
}

console.log("payroll-tasks-ok");
