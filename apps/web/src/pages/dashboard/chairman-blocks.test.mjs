import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * /dashboard/chairman 的防回退约束。
 *
 * 用 .mjs 读源码而不是渲染断言：ChairmanDashboardPage 运行时 import lib/api
 * （读 import.meta.env），在 node 里加载不了。同 pages/inbox/inbox-blocks.test.mjs。
 *
 * 这一页与 /ledger、/tax、/audit 相反，是**刻意不拆任务切换器**的（理由见
 * dashboard/chairman-questions.ts 抬头）。下面前两条就是把这个判断钉住：
 * 谁想把驾驶舱改成 tab 页，得先来改这条测试并写下比那四条更强的理由。
 */
const RAW_SOURCE = readFileSync(new URL("../ChairmanDashboardPage.tsx", import.meta.url), "utf8");

/**
 * 抬头的文件注释里引用了被删掉的那段编造逻辑（原样抄出来说明它错在哪），
 * 扫描时必须把注释去掉，否则「不得再出现估算系数」会被自己的说明文字绊倒。
 */
const SOURCE = RAW_SOURCE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** 首屏允许出现的区块，顺序即呈现顺序。 */
const ALLOWED_BLOCKS = [
  "PageHeader",
  "DashboardKpiCards",
  "DashboardQuestionSection",
  "Collapse"
];

test("刻意不拆任务：驾驶舱没有任务切换器", () => {
  assert.ok(!SOURCE.includes("TaskFocusShell"), "驾驶舱没有工作区可切，不该装任务切换器");
  assert.ok(!SOURCE.includes("?task="), "任务参数对一张报告页没有意义");
});

test("待办与风险默认可见，不得收进折叠或第二个 tab", () => {
  assert.ok(SOURCE.includes("<DashboardAlertCards"), "四张待办卡是整页唯一的行动信号");
  const alertIndex = SOURCE.indexOf("<DashboardAlertCards");
  const collapseIndex = SOURCE.indexOf("<Collapse");
  assert.ok(alertIndex > 0 && alertIndex < collapseIndex, "待办卡必须排在唯一那个折叠块之前，且不在其中");
});

test("首屏恰好 5 个区块：页头+KPI、三问、收起的财务细节", () => {
  const rendered = ALLOWED_BLOCKS.filter((block) => SOURCE.includes(`<${block}`));
  assert.deepEqual(rendered, ALLOWED_BLOCKS, "首屏应恰好由这几种块组成");

  const sections = SOURCE.match(/<section /g) ?? [];
  const questionSections = SOURCE.match(/<DashboardQuestionSection /g) ?? [];
  assert.equal(sections.length, 2, "只剩两个裸 section：页头+KPI，以及收起的财务细节");
  assert.equal(questionSections.length, 3, "三问各一段");
  assert.equal(
    sections.length + questionSections.length,
    5,
    "首屏区块上限为 5（改造前是 6 个平级 section、13 张卡）"
  );
});

test("每一段都先给结论，结论来自纯函数而不是页面里临时算", () => {
  assert.ok(SOURCE.includes("buildChairmanQuestions"), "三问的结论必须走纯函数推导，才测得到");
  for (const key of ["profit", "cash", "decisions"]) {
    assert.ok(SOURCE.includes(`"${key}"`), `三问缺了 ${key}`);
  }
});

test("编造的「近 6 月收支趋势」不得回来", () => {
  assert.ok(!SOURCE.includes("DashboardTrendChart"), "趋势图 6 个点里 5 个是写死系数乘出来的，已删除");
  assert.ok(!SOURCE.includes("factors"), "不得再出现估算系数");
  assert.ok(!SOURCE.includes("近 6 月"), "后端没有按期间的历史收入/成本接口，画不出就不画");

  // 饼图留着：它的估算只发生在成本/费用的内部构成，且各分块之和恒等于营业收入
  // （见 expense-slices.ts 的不变式与它的测试），与「把本月数乘系数当历史」不是一回事。
  assert.ok(SOURCE.includes("<DashboardPieChart"), "费用构成饼图的口径有测试守着，保留");
});

test("guided 与 pro 只在措辞上分轨，看到的块是同一批", () => {
  assert.ok(SOURCE.includes("isGuided ? \"经营报告\""), "guided 用白话页名");
  const guidedBranches = SOURCE.match(/isGuided \?/g) ?? [];
  assert.ok(
    guidedBranches.length <= 2,
    "双轨差异只保留在标题与副标题上；块的多少两轨必须一致，否则 pro 用户看到的驾驶舱又变回一堵墙"
  );
});
