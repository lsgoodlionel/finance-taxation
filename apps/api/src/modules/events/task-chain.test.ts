import test from "node:test";
import assert from "node:assert/strict";
import type { BusinessEvent } from "@finance-taxation/domain-model";
import { buildGeneratedTasksForEvent } from "./task-chain.js";

function makeEvent(overrides: Partial<BusinessEvent> = {}): BusinessEvent {
  return {
    id: "evt-contract-1",
    companyId: "cmp-1",
    type: "sales",
    title: "企业软件订阅合同 开票申请事项",
    description: "合同编号：CNT-001",
    department: "销售部",
    ownerId: "user-1",
    occurredOn: "2026-05-22",
    amount: "100000.00",
    currency: "CNY",
    status: "draft",
    source: "manual",
    contractId: "contract-1",
    counterpartyId: null,
    projectId: null,
    createdAt: "2026-05-22T01:00:00.000Z",
    updatedAt: "2026-05-22T01:00:00.000Z",
    ...overrides
  };
}

test("buildGeneratedTasksForEvent creates contract invoice workflow tasks", () => {
  const tasks = buildGeneratedTasksForEvent({
    event: makeEvent(),
    now: "2026-05-22T02:00:00.000Z",
    actorUserId: "user-1"
  });

  assert.equal(tasks.length, 4);
  assert.equal(tasks[0]?.title, "经营事项执行主任务");
  assert.equal(tasks[1]?.title, "核对开票条件与合同条款");
  assert.equal(tasks[1]?.assigneeDepartment, "销售部");
  assert.equal(tasks[2]?.title, "确认客户开票信息");
  assert.equal(tasks[2]?.assigneeDepartment, "财务部");
  assert.equal(tasks[3]?.title, "提交开票申请并跟踪流转");
});

test("buildGeneratedTasksForEvent creates generic contract execution tasks", () => {
  const tasks = buildGeneratedTasksForEvent({
    event: makeEvent({
      id: "evt-contract-2",
      title: "企业软件订阅合同 合同执行事项"
    }),
    now: "2026-05-22T02:00:00.000Z",
    actorUserId: "user-1"
  });

  assert.equal(tasks.length, 4);
  assert.equal(tasks[1]?.title, "核对合同关键条款");
  assert.equal(tasks[2]?.title, "建立履约与资料计划");
  assert.equal(tasks[3]?.title, "同步税务和记账准备");
});

test("buildGeneratedTasksForEvent falls back to standard tasks for non-contract event", () => {
  const tasks = buildGeneratedTasksForEvent({
    event: makeEvent({
      id: "evt-general-1",
      type: "expense",
      title: "差旅报销事项",
      contractId: null,
      department: "行政部"
    }),
    now: "2026-05-22T02:00:00.000Z",
    actorUserId: "user-1"
  });

  assert.equal(tasks.length, 3);
  assert.equal(tasks[1]?.title, "核对资料完整性");
  assert.equal(tasks[2]?.title, "生成税务处理建议");
});
