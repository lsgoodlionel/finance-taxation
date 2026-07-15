import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { EventDetail } from "../../lib/api";
import {
  useI18n,
  TASK_STATUS_LABELS,
  TASK_PRIORITY_SHORT,
  DOC_STATUS_LABELS,
  DOC_TYPE_LABELS,
  VOUCHER_STATUS_LABELS,
  VOUCHER_TYPE_LABELS,
  TAX_STATUS_LABELS
} from "../../lib/i18n";
import { ProcessFlowCard } from "../../features/process-flow/ProcessFlowCard";
import { buildProcessFlowPageContext } from "../../features/process-flow/page-context";
import { resolveProcessFlowContext } from "../../features/process-flow/resolve";
import { ResultBanner } from "../../components/ui/ResultBanner";
import { AiEventInsights } from "./AiEventInsights";
import { deriveContractRevenueSummary } from "./contract-revenue-summary";
import { derivePurchaseExceptionSummary } from "./purchase-exception-summary";
import { deriveTravelExceptionSummary } from "./travel-exception-summary";

function statusBadge(status: string) {
  const map: Record<string, string> = {
    draft: "badge badge-gray",
    awaiting_documents: "badge badge-yellow",
    awaiting_approval: "badge badge-blue",
    analyzed: "badge badge-green",
    blocked: "badge badge-red"
  };
  return map[status] ?? "badge badge-gray";
}

function RenderTaskTree({ nodes }: { nodes: EventDetail["taskTree"] }) {
  const { t } = useI18n();
  if (!nodes.length) return <p className="text-muted text-sm">当前还没有任务。</p>;
  return (
    <ul style={{ paddingLeft: 20, lineHeight: 1.9, fontSize: 13.5 }}>
      {nodes.map((node) => (
        <li key={node.id}>
          {node.title} · <span className="text-muted">{t(TASK_STATUS_LABELS, node.status)}</span> · {t(TASK_PRIORITY_SHORT, node.priority)}
          {node.children.length ? <RenderTaskTree nodes={node.children} /> : null}
        </li>
      ))}
    </ul>
  );
}

export interface EventDetailBodyProps {
  detail: EventDetail;
  selectedEventId: string | null;
}

export function EventDetailBody({ detail, selectedEventId }: EventDetailBodyProps) {
  const navigate = useNavigate();
  const { t } = useI18n();

  const processFlowContext = useMemo(() => {
    const resolved = resolveProcessFlowContext({
      event: {
        id: detail.id,
        type: detail.type,
        title: detail.title,
        description: detail.description,
        status: detail.status
      },
      detail: {
        tasks: detail.tasks.map((task) => ({ id: task.id })),
        generatedDocuments: detail.generatedDocuments.map((document) => ({ id: document.id })),
        vouchers: detail.vouchers.map((voucher) => ({ id: voucher.id })),
        taxItems: detail.taxItems.map((taxItem) => ({ id: taxItem.id }))
      }
    });

    if (resolved.branch === "common") {
      return {
        ...resolved,
        nodes: buildProcessFlowPageContext({
          currentNodeId: resolved.currentNodeId,
          businessEventId: detail.id
        }).nodes
      };
    }

    return resolved;
  }, [detail]);
  const currentFlowNode = useMemo(
    () => processFlowContext?.nodes.find((node) => node.id === processFlowContext.currentNodeId) ?? null,
    [processFlowContext]
  );
  const nextFlowNode = useMemo(
    () => processFlowContext?.nodes.find((node) => node.status === "pending") ?? null,
    [processFlowContext]
  );
  const missingFlowDocuments = useMemo(
    () => nextFlowNode?.documents ?? currentFlowNode?.documents ?? [],
    [currentFlowNode, nextFlowNode]
  );
  const purchaseExceptionSummary = useMemo(
    () => derivePurchaseExceptionSummary(detail.type, detail.description),
    [detail]
  );
  const travelExceptionSummary = useMemo(
    () => deriveTravelExceptionSummary(detail.type, detail.description),
    [detail]
  );
  const contractRevenueSummary = useMemo(
    () => deriveContractRevenueSummary(detail.type, detail.description),
    [detail]
  );
  const exceptionSummary = purchaseExceptionSummary ?? travelExceptionSummary ?? contractRevenueSummary;

  return (
    <div>
      {selectedEventId && <AiEventInsights businessEventId={selectedEventId} />}
      <ResultBanner
        tone="info"
        message={`下游对象：任务 ${detail.tasks.length} 项、单据 ${detail.generatedDocuments.length} 份、凭证 ${detail.vouchers.length} 张、税务事项 ${detail.taxItems.length} 条。建议先完成当前步骤，再进入对应结果页。`}
      />
      {exceptionSummary && (
        <div
          style={{
            marginTop: 12,
            marginBottom: 16,
            borderRadius: 16,
            border: exceptionSummary.tone === "error"
              ? "1px solid rgba(185,28,28,0.18)"
              : "1px solid rgba(217,119,6,0.18)",
            background: exceptionSummary.tone === "error"
              ? "rgba(254,242,242,0.92)"
              : "rgba(255,251,235,0.96)",
            padding: "14px 16px",
            display: "grid",
            gap: 8
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700 }}>{exceptionSummary.title}</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.7 }}>{exceptionSummary.summary}</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, lineHeight: 1.8 }}>
            {exceptionSummary.bullets.map((bullet) => (
              <li key={bullet}>{bullet}</li>
            ))}
          </ul>
        </div>
      )}
      {processFlowContext && (
        <div style={{ marginTop: 16, marginBottom: 24 }}>
          <ProcessFlowCard
            mode="inline"
            title="当前事项流程位置"
            subtitle="悬停节点查看详情，点击可跳转处理"
            activeBranch={processFlowContext.branch === "common" ? undefined : processFlowContext.branch}
            currentNodeId={processFlowContext.currentNodeId}
            nodes={processFlowContext.nodes}
            businessEventId={detail.id}
          />
          {(currentFlowNode || nextFlowNode) && (
            <div
              style={{
                marginTop: 12,
                padding: "14px 16px",
                borderRadius: 16,
                border: "1px solid rgba(20,40,60,0.08)",
                background: "rgba(248,250,252,0.8)",
                display: "grid",
                gap: 8
              }}
            >
              <div><strong>当前步骤：</strong>{currentFlowNode?.title ?? "—"}</div>
              <div><strong>下一步骤：</strong>{nextFlowNode?.title ?? "当前已到流程末端"}</div>
              <div><strong>待补资料：</strong>{missingFlowDocuments.length ? missingFlowDocuments.join(" / ") : "当前无明显缺失资料"}</div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* 左列 */}
        <div style={{ display: "grid", gap: 20 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--c-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              事项描述
            </div>
            <p style={{ lineHeight: 1.8, margin: 0, fontSize: 13.5 }}>{detail.description}</p>
          </div>

          {/* 单据映射 */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--c-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              单据映射
            </div>
            {detail.documentMappings.length ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>类型</th><th>单据</th><th>状态</th><th>部门</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.documentMappings.map((item) => (
                    <tr key={item.id}>
                      <td>{t(DOC_TYPE_LABELS, item.documentType)}</td>
                      <td>
                        <div>{item.title}</div>
                        {item.notes && <div className="text-muted text-sm mt-4">{item.notes}</div>}
                      </td>
                      <td><span className={statusBadge(item.status)}>{t(DOC_STATUS_LABELS, item.status)}</span></td>
                      <td>{item.ownerDepartment}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-muted text-sm">暂无单据映射</p>}
          </div>

          {/* 已生成单据 */}
          {detail.generatedDocuments.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--c-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                已生成单据
              </div>
              <table className="data-table">
                <thead>
                  <tr><th>名称</th><th>状态</th><th>部门</th></tr>
                </thead>
                <tbody>
                  {detail.generatedDocuments.map((item) => (
                    <tr key={item.id}>
                      <td>{item.title}</td>
                      <td><span className={statusBadge(item.status)}>{t(DOC_STATUS_LABELS, item.status)}</span></td>
                      <td>{item.ownerDepartment}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                className="btn btn-outline btn-xs mt-8"
                onClick={() => navigate("/documents", { state: { businessEventId: detail.id } })}
              >
                前往单据中心 →
              </button>
            </div>
          )}

          {/* 税务映射 */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--c-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              税务映射
            </div>
            {detail.taxMappings.length ? (
              <table className="data-table">
                <thead>
                  <tr><th>税种</th><th>处理建议</th><th>状态</th><th>申报期</th></tr>
                </thead>
                <tbody>
                  {detail.taxMappings.map((item) => (
                    <tr key={item.id}>
                      <td>{item.taxType}</td>
                      <td>
                        <div>{item.treatment}</div>
                        {item.basis && <div className="text-muted text-sm mt-4">{item.basis}</div>}
                      </td>
                      <td><span className={statusBadge(item.status)}>{t(TAX_STATUS_LABELS, item.status)}</span></td>
                      <td>{item.filingPeriod}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-muted text-sm">暂无税务映射</p>}
          </div>
        </div>

        {/* 右列 */}
        <div style={{ display: "grid", gap: 20 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--c-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              任务树
            </div>
            <RenderTaskTree nodes={detail.taskTree} />
          </div>

          {/* 凭证草稿 */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--c-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
              凭证草稿
            </div>
            {detail.voucherDrafts.length ? (
              <div style={{ display: "grid", gap: 12 }}>
                {detail.voucherDrafts.map((v) => (
                  <div key={v.id} style={{ border: "1px solid var(--c-border)", borderRadius: "var(--r-md)", padding: 12 }}>
                    <div className="flex-row" style={{ marginBottom: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 13.5 }}>{v.summary}</span>
                      <span className={statusBadge(v.status)}>{t(VOUCHER_STATUS_LABELS, v.status)}</span>
                      <span className="badge badge-gray">{t(VOUCHER_TYPE_LABELS, v.voucherType)}</span>
                    </div>
                    <table className="data-table">
                      <thead>
                        <tr><th>摘要</th><th>科目</th><th>借方</th><th>贷方</th></tr>
                      </thead>
                      <tbody>
                        {v.lines.map((line) => (
                          <tr key={line.id}>
                            <td>{line.summary}</td>
                            <td>{line.accountCode} {line.accountName}</td>
                            <td>{line.debit}</td>
                            <td>{line.credit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            ) : <p className="text-muted text-sm">暂无凭证草稿</p>}
            {detail.vouchers.length > 0 && (
              <button
                className="btn btn-outline btn-xs mt-8"
                onClick={() => navigate("/vouchers", { state: { businessEventId: detail.id } })}
              >
                前往凭证中心 →
              </button>
            )}
          </div>

          {/* 活动时间轴 */}
          {detail.activities.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--c-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                活动时间轴
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {detail.activities.map((act) => (
                  <div key={act.id} style={{ fontSize: 13, lineHeight: 1.7, borderLeft: "2px solid var(--c-border)", paddingLeft: 12 }}>
                    <span className="text-muted">{act.createdAt?.slice(0, 16)} · {act.actorName}</span>
                    <div>{act.summary}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
