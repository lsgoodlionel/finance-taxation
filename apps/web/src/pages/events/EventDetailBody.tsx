/**
 * 一条经营事项的详情体。
 *
 * 改造前这里平铺了 12 个平级区块（AI 洞察、下游计数条、异常摘要、流程总览卡、
 * 当前/下一步骤盒、事项描述、单据映射、已生成单据、税务映射、任务树、凭证草稿、
 * 活动时间轴），其中 6 个是只读关联表，用户要滚过一屏多才能看到自己该做什么。
 *
 * 现在只保留 5 块，按「先看进度，再看事实，再看判断，最后才是参考资料」排列：
 *   1. 这一笔办到哪了（ObjectFlowBar，替代流程总览卡 + 当前/下一步骤盒）
 *   2. 这一笔是什么（描述 + 下游计数 + 异常摘要）
 *   3. AI 财税洞察（判断依据，保留）
 *   4. 相关的单子与记录（RelatedObjectsPanel，默认收起，全部可跳转）
 *   5. 这一笔的明细与历史（EventReferenceDetails，默认收起，事项本地只读明细）
 *
 * 流程推导仍走 features/process-flow 的 resolveProcessFlowContext，
 * 见 event-object-flow.ts 的说明——那是全仓唯一按事项真实数据反推流程位置的地方。
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { EventDetail } from "../../lib/api";
import { collectRelatedObjects } from "../../lib/object-flow";
import { ObjectFlowBar } from "../../components/ui/ObjectFlowBar";
import { RelatedObjectsPanel } from "../../components/ui/RelatedObjectsPanel";
import { AiEventInsights } from "./AiEventInsights";
import { EventReferenceDetails } from "./EventReferenceDetails";
import { EventSummaryCard, type EventExceptionSummary } from "./EventSummaryCard";
import { buildEventObjectFlow } from "./event-object-flow";
import { deriveContractRevenueSummary } from "./contract-revenue-summary";
import { derivePurchaseExceptionSummary } from "./purchase-exception-summary";
import { deriveTravelExceptionSummary } from "./travel-exception-summary";

const BODY_STYLE = { display: "grid", gap: 16 } as const;

const BULK_LINK_STYLE = {
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  fontSize: 12.5,
  color: "var(--v3-color-primary, #2563eb)"
} as const;

export interface EventDetailBodyProps {
  detail: EventDetail;
  selectedEventId: string | null;
}

export function EventDetailBody({ detail, selectedEventId }: EventDetailBodyProps) {
  const navigate = useNavigate();

  const flow = useMemo(() => buildEventObjectFlow(detail), [detail]);
  const relatedObjects = useMemo(() => collectRelatedObjects(flow), [flow]);

  const exception = useMemo<EventExceptionSummary | null>(
    () =>
      derivePurchaseExceptionSummary(detail.type, detail.description)
      ?? deriveTravelExceptionSummary(detail.type, detail.description)
      ?? deriveContractRevenueSummary(detail.type, detail.description),
    [detail]
  );

  const bulkLinks = (
    <>
      {detail.generatedDocuments.length > 0 ? (
        <button
          type="button"
          style={BULK_LINK_STYLE}
          onClick={() => navigate("/documents", { state: { businessEventId: detail.id } })}
        >
          在单据中心看这一笔的全部单据 →
        </button>
      ) : null}
      {detail.vouchers.length > 0 ? (
        <button
          type="button"
          style={BULK_LINK_STYLE}
          onClick={() => navigate("/vouchers", { state: { businessEventId: detail.id } })}
        >
          在凭证中心看这一笔的全部凭证 →
        </button>
      ) : null}
    </>
  );

  return (
    <div style={BODY_STYLE}>
      <ObjectFlowBar flow={flow} title="这一笔事项办到哪了" />

      <EventSummaryCard
        description={detail.description}
        counts={{
          tasks: detail.tasks.length,
          documents: detail.generatedDocuments.length,
          vouchers: detail.vouchers.length,
          taxItems: detail.taxItems.length
        }}
        exception={exception}
        bulkLinks={bulkLinks}
      />

      {selectedEventId ? <AiEventInsights businessEventId={selectedEventId} /> : null}

      <RelatedObjectsPanel objects={relatedObjects} />

      <EventReferenceDetails detail={detail} />
    </div>
  );
}
