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

test("buildGeneratedTasksForEvent creates missing-invoice purchase expense tasks", () => {
  const tasks = buildGeneratedTasksForEvent({
    event: makeEvent({
      id: "evt-purchase-missing",
      type: "purchase_expense" as unknown as BusinessEvent["type"],
      title: "客户活动用品采购缺少发票",
      description: JSON.stringify({
        input: { providedDocumentTypes: ["expense_claim"] },
        expected: {
          classification: "sales_expense",
          documentTypes: ["expense_claim", "invoice_bundle"],
          exceptions: ["missing_invoice_bundle"],
          risks: ["unsupported_tax_deduction"]
        }
      }),
      contractId: null,
      department: "销售部",
      status: "needs_review" as unknown as BusinessEvent["status"],
      source: "v4_acceptance_fixture" as unknown as BusinessEvent["source"]
    }),
    now: "2026-05-22T02:00:00.000Z",
    actorUserId: "user-1"
  });

  assert.equal(tasks.length, 4);
  assert.equal(tasks[1]?.title, "补齐发票与票据依据");
  assert.equal(tasks[1]?.assigneeDepartment, "销售部");
  assert.equal(tasks[2]?.title, "复核税前扣除与进项限制");
  assert.equal(tasks[2]?.assigneeDepartment, "财务部");
  assert.equal(tasks[3]?.title, "补票前冻结正式过账");
});

test("buildGeneratedTasksForEvent creates duplicate reimbursement handling tasks", () => {
  const tasks = buildGeneratedTasksForEvent({
    event: makeEvent({
      id: "evt-purchase-dup",
      type: "purchase_expense" as unknown as BusinessEvent["type"],
      title: "重复提交办公耗材采购",
      description: JSON.stringify({
        input: { providedDocumentTypes: ["expense_claim", "invoice_bundle"] },
        expected: {
          classification: "low_value_consumable",
          documentTypes: ["expense_claim", "invoice_bundle"],
          exceptions: ["duplicate_invoice"],
          risks: ["duplicate_reimbursement"]
        }
      }),
      contractId: null,
      department: "销售部",
      status: "needs_review" as unknown as BusinessEvent["status"],
      source: "v4_acceptance_fixture" as unknown as BusinessEvent["source"]
    }),
    now: "2026-05-22T02:00:00.000Z",
    actorUserId: "user-1"
  });

  assert.equal(tasks.length, 4);
  assert.equal(tasks[1]?.title, "核对重复票据与历史报销");
  assert.equal(tasks[2]?.title, "关闭重复事项或并单处理");
  assert.equal(tasks[3]?.title, "复核税务抵扣留痕");
});

test("buildGeneratedTasksForEvent creates asset reclassification tasks", () => {
  const tasks = buildGeneratedTasksForEvent({
    event: makeEvent({
      id: "evt-purchase-class",
      type: "purchase_expense" as unknown as BusinessEvent["type"],
      title: "高价值研发工作站误分类办公用品",
      description: JSON.stringify({
        input: {
          providedDocumentTypes: ["purchase_request", "invoice_bundle", "acceptance_record"],
          claimedClassification: "office_supplies"
        },
        expected: {
          classification: "fixed_asset",
          documentTypes: ["purchase_request", "invoice_bundle", "acceptance_record"],
          exceptions: ["classification_conflict"],
          risks: ["expense_overstatement"]
        }
      }),
      contractId: null,
      department: "销售部",
      status: "needs_review" as unknown as BusinessEvent["status"],
      source: "v4_acceptance_fixture" as unknown as BusinessEvent["source"]
    }),
    now: "2026-05-22T02:00:00.000Z",
    actorUserId: "user-1"
  });

  assert.equal(tasks.length, 4);
  assert.equal(tasks[1]?.title, "改走固定资产审批链");
  assert.equal(tasks[2]?.title, "补齐资产验收与台账资料");
  assert.equal(tasks[3]?.title, "按固定资产口径调整凭证");
});

test("buildGeneratedTasksForEvent creates missing-hotel travel expense tasks", () => {
  const tasks = buildGeneratedTasksForEvent({
    event: makeEvent({
      id: "evt-travel-missing",
      type: "travel_expense" as unknown as BusinessEvent["type"],
      title: "北京展会差旅缺少住宿发票",
      description: JSON.stringify({
        input: { providedDocumentTypes: ["travel_request", "expense_claim", "transport_invoice"] },
        expected: {
          classification: "travel_expense",
          documentTypes: ["travel_request", "expense_claim", "transport_invoice", "hotel_invoice"],
          exceptions: ["missing_hotel_invoice"],
          risks: ["unsupported_travel_cost"]
        }
      }),
      contractId: null,
      department: "销售部",
      status: "needs_review" as unknown as BusinessEvent["status"],
      source: "v4_acceptance_fixture" as unknown as BusinessEvent["source"]
    }),
    now: "2026-05-22T02:00:00.000Z",
    actorUserId: "user-1"
  });

  assert.equal(tasks.length, 4);
  assert.equal(tasks[1]?.title, "补齐住宿发票与行程依据");
  assert.equal(tasks[2]?.title, "确认暂估入账与税前扣除限制");
  assert.equal(tasks[3]?.title, "补票前冻结住宿部分过账");
});

test("buildGeneratedTasksForEvent creates cross-period travel accrual tasks", () => {
  const tasks = buildGeneratedTasksForEvent({
    event: makeEvent({
      id: "evt-travel-period",
      type: "travel_expense" as unknown as BusinessEvent["type"],
      title: "跨期差旅报销计入错误月份",
      description: JSON.stringify({
        input: { providedDocumentTypes: ["travel_request", "expense_claim", "transport_invoice", "hotel_invoice"] },
        expected: {
          classification: "travel_expense_accrual",
          documentTypes: ["travel_request", "expense_claim", "transport_invoice", "hotel_invoice"],
          exceptions: ["accounting_period_conflict"],
          risks: ["cutoff_misstatement"]
        }
      }),
      contractId: null,
      department: "销售部",
      status: "needs_review" as unknown as BusinessEvent["status"],
      source: "v4_acceptance_fixture" as unknown as BusinessEvent["source"]
    }),
    now: "2026-05-22T02:00:00.000Z",
    actorUserId: "user-1"
  });

  assert.equal(tasks.length, 4);
  assert.equal(tasks[1]?.title, "拆分跨期差旅归属月份");
  assert.equal(tasks[2]?.title, "复核认证抵扣与所得税期间");
  assert.equal(tasks[3]?.title, "提交跨期差旅最终授权");
});

test("buildGeneratedTasksForEvent creates missing-acceptance contract revenue tasks", () => {
  const tasks = buildGeneratedTasksForEvent({
    event: makeEvent({
      id: "evt-contract-missing",
      type: "contract_revenue" as unknown as BusinessEvent["type"],
      title: "系统实施服务缺少验收单",
      description: JSON.stringify({
        input: { providedDocumentTypes: ["service_contract", "output_invoice"] },
        expected: {
          classification: "deferred_service_revenue",
          documentTypes: ["service_contract", "acceptance_record", "output_invoice"],
          exceptions: ["missing_acceptance_record"],
          risks: ["premature_revenue_recognition"]
        }
      }),
      contractId: "CON-MISSING-001-contract",
      department: "人事部",
      status: "needs_review" as unknown as BusinessEvent["status"],
      source: "v4_acceptance_fixture" as unknown as BusinessEvent["source"]
    }),
    now: "2026-05-22T02:00:00.000Z",
    actorUserId: "user-1"
  });

  assert.equal(tasks.length, 4);
  assert.equal(tasks[1]?.title, "补齐验收单与履约证据");
  assert.equal(tasks[2]?.title, "冻结正式收入确认");
  assert.equal(tasks[3]?.title, "复核开票与所得税时点");
});
