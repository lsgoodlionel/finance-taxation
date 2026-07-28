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

/**
 * 趋势图的源码（同样去掉注释：抬头照抄了被删掉的那段编造逻辑用于说明，
 * 不去掉的话「不得出现估算系数」会被自己的说明文字绊倒）。
 */
const TREND_CHART_SOURCE = readFileSync(new URL("./DashboardTrendChart.tsx", import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

test("趋势图回来了，但每个点都必须来自接口", () => {
  // 上一版 6 个点里 5 个是 `factors = [0.72, ...]` 乘本月数得到的。它现在被允许出现
  // 在页面上，唯一的前提是：数据源是后端按期间聚合的总账，前端一个数都不许自己造。
  assert.ok(SOURCE.includes("<DashboardTrendChart"), "接口就绪后趋势图回到「公司赚不赚钱？」一段");
  assert.ok(
    TREND_CHART_SOURCE.includes("getDashboardChairmanTrend"),
    "趋势数据只能来自 /api/dashboard/chairman/trend"
  );
  assert.ok(
    TREND_CHART_SOURCE.includes("buildTrendSeries"),
    "接口返回到图上的点必须走 trend-series.ts 的纯函数，否则「每个点都来自接口」测不到"
  );

  // 防回退：任何形式的系数外推、或再次拿本月 profitOverview 反推历史，都不许回来。
  assert.ok(!TREND_CHART_SOURCE.includes("factors"), "不得再出现估算系数");
  assert.ok(!TREND_CHART_SOURCE.includes("profitOverview"), "历史各期只能来自趋势接口，不得由本月数派生");
  // recharts 的 connectNulls 默认 false，即缺口断开。压根不提它就不会开错。
  assert.ok(
    !TREND_CHART_SOURCE.includes("connectNulls"),
    "没有账的期间必须断开；把缺口连起来等于把留白画成一条实测曲线"
  );

  // 饼图留着：它的估算只发生在成本/费用的内部构成，且各分块之和恒等于营业收入
  // （见 expense-slices.ts 的不变式与它的测试），与「把本月数乘系数当历史」不是一回事。
  assert.ok(SOURCE.includes("<DashboardPieChart"), "费用构成饼图的口径有测试守着，保留");
});

test("guided 与 pro 只在措辞上分轨，看到的块是同一批", () => {
  // guided 页名必须是白话，且不能与 guided 导航里的「经营报告」(/reports) 重名 ——
  // /home 的空态按钮和 KPI 钻取都指向本页，两处叫同一个词会让用户以为是同一页。
  assert.ok(SOURCE.includes("isGuided ? \"经营概览\""), "guided 用白话页名");
  assert.ok(!SOURCE.includes("\"经营报告\""), "guided 页名不得与 /reports 的导航标签重名");
  const guidedBranches = SOURCE.match(/isGuided \?/g) ?? [];
  assert.ok(
    guidedBranches.length <= 2,
    "双轨差异只保留在标题与副标题上；块的多少两轨必须一致，否则 pro 用户看到的驾驶舱又变回一堵墙"
  );
});
