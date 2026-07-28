import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * /reports 首屏区块数的防回退约束。
 *
 * 改造前首屏 8 个平级区块：页头、业务链路条、侧栏四张卡（期间上下文 / 工作台视图 /
 * 快照与对比 / 输出动作）、结果工作台卡、当前视图面板。侧栏把「选期间」「选看哪张表」
 * 「做快照对比」「打包导出」四件性质完全不同的事并排常驻，用户得先在噪音里找出
 * 「我现在要做什么」。
 *
 * 改造后 5 块：页头（含期间上下文）、业务链路条、任务切换器、结果概览条、当前面板。
 * 四件事由 TaskFocusShell 承载，一次只有一件事进 DOM。
 *
 * 用 .mjs 读源码而不是渲染断言：ReportsWorkbench 挂着 BudgetVariancePanel，
 * 后者运行时 import lib/api（读 import.meta.env），在 node 里加载不了。
 * 同 pages/events/event-detail-blocks.test.mjs、pages/inbox/inbox-blocks.test.mjs。
 */
/**
 * 读源码并剥离注释：本文件用「某段文案还在不在」判定区块去留，而改造说明本身
 * 就会引用这些文案（「输出动作已移交…」），不剥离会把注释当成回退误报。
 * 剥离规则同 lib/terminology-coverage.test.mjs，保留 https:// 这类非注释双斜杠。
 */
const read = (name) =>
  readFileSync(new URL(`./${name}`, import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const SHELL = read("ReportsShell.tsx");
const CONTAINER = read("ReportsShellContainer.tsx");
const HEADER = read("ReportsHeader.tsx");
const WORKBENCH = read("ReportsWorkbench.tsx");

test("壳层只剩三层：页头 + 业务链路条 + 当前这件事", () => {
  assert.ok(SHELL.includes("{header}"), "页头槽位应保留");
  assert.ok(SHELL.includes("<FinanceFlowBar current=\"reports\" />"), "业务链路条应保留");
  assert.ok(SHELL.includes("{children}"), "工作区应由 children 承载");
  assert.ok(!SHELL.includes("sidebar"), "侧栏应整体下线");
  assert.ok(!SHELL.includes("v3-result-grid"), "双栏网格应随侧栏一起去掉");
});

test("侧栏四段各自归位，不再并排常驻", () => {
  const removed = ["ReportsSidebar", "期间上下文", "工作台视图", "快照与对比", "输出动作"];
  for (const marker of removed) {
    assert.ok(!CONTAINER.includes(marker), `容器不应再引用「${marker}」`);
    assert.ok(!SHELL.includes(marker), `壳层不应再引用「${marker}」`);
  }
  // 期间是四件事共用的上下文 → 收进页头
  assert.ok(HEADER.includes("periodControl"), "期间控件应挂在页头");
  assert.ok(CONTAINER.includes("<ReportsPeriodControl"), "容器应渲染紧凑期间控件");
  // 选看哪张表 → 任务切换器
  assert.ok(CONTAINER.includes("<TaskFocusShell"), "选报表应由任务切换器承载");
  // 快照与对比 → 自成一件事
  assert.ok(CONTAINER.includes("<SnapshotComparePanel"), "快照与对比应收进「对比两期变化」");
});

test("月结 / 审计 / 稽核资料包移交 /export-center，本页不再重复一份", () => {
  for (const marker of ["getClosingBundleHtml", "openBundle", "月结资料包", "审计资料包", "稽核资料包"]) {
    assert.ok(!CONTAINER.includes(marker), `资料包相关的「${marker}」应从本页移除`);
  }
  const comparePanel = read("panels/SnapshotComparePanel.tsx");
  assert.ok(comparePanel.includes("onOpenExportCenter"), "应在对比这件事里留一个去导出中心的出口");
  assert.ok(CONTAINER.includes('navigate("/export-center")'), "出口应直接指向导出中心");
  // 快照打印版是按快照出 HTML 的独立能力（/api/reports/printable），导出中心走的是
  // /api/pdf/report，两者不等价，因此留在本页。
  assert.ok(CONTAINER.includes("getPrintableReportHtml"), "打印版能力应保留在本页");
});

test("结果区收敛成「概览条 + 面板」两块，说明文案不再指向已下线的侧栏", () => {
  assert.ok(WORKBENCH.includes('aria-label="当前结果概览"'), "结果概览条应存在");
  assert.ok(!WORKBENCH.includes("结果工作台"), "旧的结果工作台大卡标题应去掉");
  assert.ok(!WORKBENCH.includes("左侧"), "工作台不应再提「左侧」");
  for (const panel of ["BalanceSheetPanel", "ProfitStatementPanel", "CashFlowPanel", "ChairmanSummaryPanel", "ReportDiffPanel"]) {
    const source = read(`panels/${panel}.tsx`);
    assert.ok(!source.includes("左侧"), `${panel} 的空态文案不应再提「左侧」`);
  }
});

test("页头不再摆与业务链路条重复的跳转按钮", () => {
  assert.ok(!HEADER.includes("去税务申报"), "税务入口由业务链路条提供");
  assert.ok(!HEADER.includes("前往 PDF 导出中心"), "归档入口由业务链路条提供");
  assert.ok(HEADER.includes("当前视图"), "「当前视图」指示器保留（E2E 依赖）");
  assert.ok(HEADER.includes("财务报表中心"), "页面标题保持不变（E2E 依赖）");
});
