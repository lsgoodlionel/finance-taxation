import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * 详情体区块数的防回退约束。
 *
 * 改造前 EventDetailBody 平铺 12 个平级区块（其中 6 个只读关联表），实测详情高
 * 1269px。改造后只允许 5 块，且流程表达只能有一处（ObjectFlowBar），不得再把
 * ProcessFlowCard 与「当前/下一步骤盒」并排摆着重复说同一件事。
 *
 * 用 .mjs 读源码而不是渲染断言：EventDetailBody 挂着 AiEventInsights，
 * 后者运行时 import lib/api（读 import.meta.env），在 node 里加载不了。
 */
const SOURCE = readFileSync(new URL("./EventDetailBody.tsx", import.meta.url), "utf8");

/** 详情体允许出现的区块，顺序即「先看进度，再看事实，再看判断，最后才是参考资料」。 */
const ALLOWED_BLOCKS = [
  "ObjectFlowBar",
  "EventSummaryCard",
  "AiEventInsights",
  "RelatedObjectsPanel",
  "EventReferenceDetails"
];

test("详情体恰好组合 5 个区块", () => {
  const rendered = ALLOWED_BLOCKS.filter((block) => SOURCE.includes(`<${block}`));
  assert.deepEqual(rendered, ALLOWED_BLOCKS, "详情体应恰好组合这 5 块");
  assert.ok(ALLOWED_BLOCKS.length <= 5, "详情体区块上限为 5");
});

test("流程只有一处表达：ObjectFlowBar 取代流程总览卡与步骤盒", () => {
  assert.ok(!SOURCE.includes("ProcessFlowCard"), "流程总览卡应被移除");
  assert.ok(!SOURCE.includes("下一步骤："), "当前/下一步骤盒应被移除");
  assert.ok(!SOURCE.includes("下游对象："), "下游计数条应并入「这一笔是什么」");
});

test("流程推导复用 process-flow 的 resolver，不另起一套", () => {
  const flowSource = readFileSync(new URL("./event-object-flow.ts", import.meta.url), "utf8");
  assert.ok(
    flowSource.includes("resolveProcessFlowContext"),
    "当前节点必须由 features/process-flow 的 resolver 推导"
  );
  assert.ok(flowSource.includes("buildObjectFlow"), "应经 buildObjectFlow 映射成 ObjectFlow");
});
