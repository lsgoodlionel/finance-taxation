/**
 * 「这一笔事项办到哪了」——把既有的流程推导结果翻译成可呈现的 ObjectFlow。
 *
 * 关键约定：当前节点的推导**不在这里做**。全仓唯一按事项真实数据反推流程位置的
 * 地方是 features/process-flow/resolve.ts 的 resolveProcessFlowContext（它按
 * 任务/单据/凭证/税务事项是否已产生，逐层回落到 ai_precheck），本模块只做
 * 「解析结果 → ObjectFlow」的映射，避免出现第二套会漂移的推导。
 *
 * 为什么不复用 buildProcessFlowPageContext：那个函数会把「共通主线」按关键词
 * 合并进采购/招待分支节点，得到的是一张用于总览卡片的多分支拼图，节点顺序与
 * 状态不再是单调递进的。ObjectFlowBar 要的是一条线性进度（buildObjectFlow 按
 * 「第一个未完成即当前」推导），所以取分支内的线性节点集更贴切。
 */
import type { EventDetail } from "../../lib/api";
import { resolveProcessFlowContext } from "../../features/process-flow/resolve";
import type { ProcessFlowResolvedNode } from "../../features/process-flow/types";
import { buildObjectFlow, type FlowRelatedObject, type ObjectFlow } from "../../lib/object-flow";

/** 事项状态 → 当前步骤「卡在什么上」。只有真卡住才写，避免把常规待办渲染成告警。 */
const BLOCKING_STATUS_HINTS: Record<string, string> = {
  awaiting_documents: "还缺资料，补齐后才能往下走",
  awaiting_approval: "等审批通过",
  blocked: "已被挂起，需要人工介入"
};

const APPROVAL_NODE_IDS = new Set([
  "approval_dispatch",
  "purchase_approval_dispatch",
  "entertainment_approval_dispatch"
]);

const DOCUMENT_NODE_IDS = new Set([
  "document_generation",
  "purchase_document_generation",
  "entertainment_document_generation"
]);

const VOUCHER_NODE_ID = "voucher_tax_processing";
const TAX_NODE_ID = "tax_filing_archive";

/** 供 resolveProcessFlowContext 使用的最小输入——只取它真正会读的字段。 */
type FlowSourceEvent = Pick<EventDetail, "id" | "type" | "title" | "description" | "status">;

export type EventFlowSource = FlowSourceEvent & {
  tasks: ReadonlyArray<{ id: string; title?: string }>;
  generatedDocuments: ReadonlyArray<{ id: string; title?: string }>;
  vouchers: ReadonlyArray<{ id: string; summary?: string }>;
  taxItems: ReadonlyArray<{ id: string; taxType?: string }>;
};

/** 某个流程节点上「这一步产出/牵扯到的对象」，用于「看到即可达」。 */
function relatedObjectsForNode(
  node: ProcessFlowResolvedNode,
  source: EventFlowSource
): FlowRelatedObject[] {
  if (APPROVAL_NODE_IDS.has(node.id)) {
    return source.tasks.map((task) => ({ kind: "task" as const, id: task.id, label: task.title }));
  }
  if (DOCUMENT_NODE_IDS.has(node.id)) {
    return source.generatedDocuments.map((document) => ({
      kind: "document" as const,
      id: document.id,
      label: document.title
    }));
  }
  if (node.id === VOUCHER_NODE_ID) {
    return source.vouchers.map((voucher) => ({
      kind: "voucher" as const,
      id: voucher.id,
      label: voucher.summary
    }));
  }
  if (node.id === TAX_NODE_ID) {
    return source.taxItems.map((taxItem) => ({
      kind: "tax_item" as const,
      id: taxItem.id,
      label: taxItem.taxType
    }));
  }
  return [];
}

/**
 * 当前步骤的阻塞说明。
 *
 * 只在事项状态本身表示「走不下去」时才给（awaiting_* / blocked）；节点定义里的
 * documents 是「该环节通常涉及哪些资料」的静态清单，不能当成缺失清单——把它一律
 * 当阻塞会让每一笔事项都显示成卡住。缺资料时把清单附上，用户才知道要补什么。
 */
function resolveBlockedReason(status: string, node: ProcessFlowResolvedNode | undefined): string | null {
  const hint = BLOCKING_STATUS_HINTS[status];
  if (!hint) return null;
  if (status !== "awaiting_documents") return hint;
  const documents = node?.documents ?? [];
  return documents.length > 0 ? `${hint}（这一步通常需要：${documents.join("、")}）` : hint;
}

/**
 * 由事项详情构造「这一笔办到哪了」。
 *
 * 步骤状态：resolveProcessFlowContext 已把当前节点之前的节点标成 done，
 * buildObjectFlow 再按「第一个未完成即当前」还原出 current/pending，
 * 两者口径一致，不会出现两个当前步骤。
 */
export function buildEventObjectFlow(source: EventFlowSource): ObjectFlow {
  const context = resolveProcessFlowContext({
    event: {
      id: source.id,
      type: source.type,
      title: source.title,
      description: source.description,
      status: source.status
    },
    detail: {
      tasks: source.tasks.map((task) => ({ id: task.id })),
      generatedDocuments: source.generatedDocuments.map((document) => ({ id: document.id })),
      vouchers: source.vouchers.map((voucher) => ({ id: voucher.id })),
      taxItems: source.taxItems.map((taxItem) => ({ id: taxItem.id }))
    }
  });

  const currentNode = context.nodes.find((node) => node.id === context.currentNodeId);
  const blockedReason = resolveBlockedReason(source.status, currentNode);

  return buildObjectFlow(
    context.nodes.map((node) => ({
      key: node.id,
      label: node.title,
      done: node.status === "done",
      blockedReason: node.id === context.currentNodeId ? blockedReason : null,
      related: relatedObjectsForNode(node, source),
      owner: node.departments.join(" / ")
    }))
  );
}
