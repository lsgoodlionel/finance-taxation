import { buildEventObjectFlow, type EventFlowSource } from "./event-object-flow";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function makeSource(overrides: Partial<EventFlowSource> = {}): EventFlowSource {
  return {
    id: "EVT-1",
    type: "general",
    title: "普通事项",
    description: "一笔普通业务",
    status: "draft",
    tasks: [],
    generatedDocuments: [],
    vouchers: [],
    taxItems: [],
    ...overrides
  };
}

// 刚登记的事项停在 AI 初判这一步
{
  const flow = buildEventObjectFlow(makeSource());
  const current = flow.steps.find((step) => step.status === "current");
  assert(current?.key === "ai_precheck", `expected current step ai_precheck, got ${current?.key}`);
  assert(flow.nextStepKey === "ai_precheck", "expected nextStepKey ai_precheck");
  assert(flow.overall === "in_progress", "expected overall in_progress");
  // 当前步骤之前一律 done、之后一律 pending——不允许出现两个当前步骤
  assert(
    flow.steps.filter((step) => step.status === "current").length === 1,
    "expected exactly one current step"
  );
}

// 已产生凭证的事项推进到凭证与税务处理，并带上可跳转的关联对象
{
  const flow = buildEventObjectFlow(
    makeSource({
      tasks: [{ id: "TSK-1", title: "补充合同" }],
      generatedDocuments: [{ id: "DOC-1", title: "付款申请单" }],
      vouchers: [{ id: "VCH-1", summary: "支付货款" }]
    })
  );

  const current = flow.steps.find((step) => step.status === "current");
  assert(current?.key === "voucher_tax_processing", `expected voucher_tax_processing, got ${current?.key}`);
  assert(
    current?.related?.[0]?.kind === "voucher" && current?.related?.[0]?.id === "VCH-1",
    "expected current step to link the voucher"
  );

  const approval = flow.steps.find((step) => step.key === "approval_dispatch");
  assert(approval?.status === "done", "expected approval step done");
  assert(
    approval?.related?.[0]?.kind === "task" && approval?.related?.[0]?.label === "补充合同",
    "expected approval step to link the task"
  );

  const documents = flow.steps.find((step) => step.key === "document_generation");
  assert(
    documents?.related?.[0]?.kind === "document" && documents?.related?.[0]?.id === "DOC-1",
    "expected document step to link the generated document"
  );
}

// 缺资料的事项当前步骤显示为卡住，并说明要补什么
{
  const flow = buildEventObjectFlow(makeSource({ status: "awaiting_documents" }));
  const blocked = flow.steps.find((step) => step.status === "blocked");
  assert(blocked?.key === "ai_precheck", "expected the current step to be blocked");
  assert(flow.overall === "blocked", "expected overall blocked");
  assert(blocked?.hint?.includes("还缺资料") === true, "expected hint to say what is missing");
  assert(blocked?.hint?.includes("资料缺失清单") === true, "expected hint to carry the document checklist");
}

// 正常推进的事项不会被误判成卡住
{
  const flow = buildEventObjectFlow(makeSource({ status: "analyzed" }));
  assert(flow.overall === "in_progress", "expected analyzed event to keep progressing");
  assert(flow.steps.every((step) => step.status !== "blocked"), "expected no blocked step");
}

// 采购类事项走采购分支的步骤（分支推导仍由 process-flow 的 resolver 负责）
{
  const flow = buildEventObjectFlow(
    makeSource({ type: "procurement", title: "采购办公用品", tasks: [{ id: "TSK-2" }] })
  );
  const current = flow.steps.find((step) => step.status === "current");
  assert(current?.key === "purchase_approval_dispatch", `expected purchase branch, got ${current?.key}`);
}
