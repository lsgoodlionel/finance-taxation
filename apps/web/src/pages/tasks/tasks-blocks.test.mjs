import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * /tasks 首屏区块数与横幅数的防回退约束。
 *
 * 改造前首屏 8 块、全页 9 处 Alert：逾期横幅、未开始横幅、事项过滤横幅、
 * 业务指引横幅四条并排堆在页头下面，再压一整块运维视角的运行态面板，
 * 帮助浮层里又叠 3 条 Alert，外加一个永远打不开的重复 TaskDrawer。
 * 横幅堆叠的直接后果是用户把它们全部略过。
 *
 * 改造后：首屏最多 5 块（其中运行态与折叠区互斥，实际最多 4 块），
 * 页面里只剩 1 处 Alert（真实业务指引，且移进任务列表内部）。
 */
const SOURCE = readFileSync(new URL("../TasksPage.tsx", import.meta.url), "utf8");

test("页面只剩 1 处 Alert：真实业务指引，且在任务列表内部", () => {
  const alerts = SOURCE.match(/<Alert/g) ?? [];
  assert.equal(alerts.length, 1, "只允许保留 workflowGuidance 一条提示");
  assert.ok(SOURCE.includes("workflowGuidance &&"), "保留的那条必须是数据驱动的业务指引");
  const cardIndex = SOURCE.indexOf("<Card");
  assert.ok(SOURCE.indexOf("<Alert") > cardIndex, "指引应作为列表内的行内提示，不再另起全宽横幅");
});

test("页头已表达过的计数不再重复成横幅", () => {
  assert.ok(SOURCE.includes("{overdueCount} 逾期"), "逾期数留在页头标签上");
  assert.ok(SOURCE.includes("{notStartedCount} 待开始"), "待开始数留在页头标签上");
  assert.ok(!SOURCE.includes("个任务已逾期"), "逾期横幅应删除");
  assert.ok(!SOURCE.includes("个待处理任务"), "未开始横幅应删除");
  assert.ok(!SOURCE.includes("拖拽卡片或点击"), "拖拽用法说明应收进帮助面板");
});

test("事项过滤降级为一行可跳转的上下文条", () => {
  assert.ok(SOURCE.includes("tasks-context-bar"), "保留「当前只看某个事项」的上下文");
  assert.ok(SOURCE.includes('EntityLink kind="business_event"'), "关联事项必须可跳转");
});

test("运行态面板只在确有异常时占首屏，否则收进折叠区", () => {
  assert.ok(SOURCE.includes("needsRuntimeAttention"), "必须按运行态/授权态判定是否需要现在看");
  assert.ok(SOURCE.includes("{runtimeAttention && runtimePanel}"), "有异常时才直接占位");
  assert.ok(SOURCE.includes("!runtimeAttention && ("), "无异常时收进默认收起的折叠区，能力不丢");
});

test("帮助浮层换成统一 HelpPanel，重复的空抽屉已删除", () => {
  assert.ok(SOURCE.includes("<TasksHelpPanel"), "帮助改用统一面板");
  assert.ok(!SOURCE.includes('position: "fixed"'), "手写的浮层应删除");
  const drawers = SOURCE.match(/<TaskDrawer/g) ?? [];
  assert.equal(drawers.length, 1, "只应有一个任务详情抽屉");
  const help = readFileSync(new URL("./TasksHelpPanel.tsx", import.meta.url), "utf8");
  assert.ok(!help.includes("<Alert"), "帮助内容用 HelpPanel 的分段结构，不再叠 Alert");
});

test("「这个任务走到哪了」由真实字段推导，且只在详情里画", () => {
  assert.ok(SOURCE.includes("buildTaskFlow"), "流程必须经 task-flow 推导");
  assert.ok(SOURCE.includes("flow={detailFlow}"), "流程条挂在详情抽屉上，不占首屏");
  const flowSource = readFileSync(new URL("./task-flow.ts", import.meta.url), "utf8");
  assert.ok(flowSource.includes("buildObjectFlow"), "应经 buildObjectFlow 映射成 ObjectFlow");
  assert.ok(
    !/import[^;]*TaskChecklistItem/.test(flowSource),
    "前端拿不到清单项（lib/api.ts 没有对应接口），不得拿它凑步骤"
  );
  assert.ok(
    flowSource.includes('task.status === "cancelled"'),
    "已取消的任务不画流程条——数据撑不起就不画"
  );
});
