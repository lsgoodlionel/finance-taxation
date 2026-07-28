import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * /inbox 首屏区块数的防回退约束。
 *
 * 改造前 MyDayPage 平铺 10 个平级区块（实测滚 2.9 屏）：hero、快速开始清单、
 * 逐税种申报到期卡、4 个 Statistic、紧急 Alert、四张待办卡、其他模块待办卡片墙、
 * 空状态卡。改造后只允许 5 块，且顺序即「今天什么状况 → 要处理什么 →
 * 顺手能做完什么 → 其余」。
 *
 * 用 .mjs 读源码而不是渲染断言：MyDayPage 运行时 import lib/api（读
 * import.meta.env），在 node 里加载不了。同 pages/events/event-detail-blocks.test.mjs。
 */
const SOURCE = readFileSync(new URL("../MyDayPage.tsx", import.meta.url), "utf8");

/** 首屏允许出现的区块，顺序即呈现顺序。 */
const ALLOWED_BLOCKS = [
  "PageHeader",
  "InboxTodayBar",
  "InboxTriageBoard",
  "InboxAiDraftsCard",
  "InboxMoreTodos"
];

test("首屏恰好组合 5 个区块", () => {
  const rendered = ALLOWED_BLOCKS.filter((block) => SOURCE.includes(`<${block}`));
  assert.deepEqual(rendered, ALLOWED_BLOCKS, "首屏应恰好组合这 5 块");
  assert.ok(ALLOWED_BLOCKS.length <= 5, "首屏区块上限为 5");
});

test("统计条、紧急横幅、逐税种到期卡都并进了「今天的状况」", () => {
  assert.ok(!SOURCE.includes("<Statistic"), "4 个 Statistic 应压缩进 InboxTodayBar");
  assert.ok(!SOURCE.includes("<Alert"), "紧急 Alert 应并入 InboxTodayBar 的一行提示");
  assert.ok(!SOURCE.includes("deadlines.map"), "逐税种到期卡应压成一句汇总提示");
  assert.ok(SOURCE.includes("summarizeTaxDeadlines"), "到期汇总必须走纯函数推导");
});

test("四张待办卡按性质归拢：三张摘要并排 + AI 草稿独立成块", () => {
  for (const card of ["InboxTasksCard", "InboxRiskCard", "InboxApprovalsCard"]) {
    assert.ok(!SOURCE.includes(card), `${card} 应收进 InboxTriageBoard 并排展示`);
  }
  assert.ok(SOURCE.includes("<InboxAiDraftsCard"), "AI 草稿是唯一能就地做完的工作台，独立成块");
});

test("其他模块待办没有被删掉，只是默认收起", () => {
  const board = readFileSync(new URL("./InboxMoreTodos.tsx", import.meta.url), "utf8");
  assert.ok(board.includes("<details"), "其他模块待办应默认收起而不是删除");
  assert.ok(board.includes("item.actionPath"), "每条仍要能点进对应模块");
});

test("AI 草稿卡始终渲染，不受其它待办是否为空影响", () => {
  const draftIndex = SOURCE.indexOf("<InboxAiDraftsCard");
  const loadingIndex = SOURCE.indexOf("{loading ?");
  assert.ok(draftIndex > loadingIndex, "AI 草稿卡应排在加载分支之外");
  assert.ok(!SOURCE.includes("isEmpty ?"), "整页空状态卡已并入 InboxTodayBar 的一句庆祝语");
});
