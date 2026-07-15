import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { BusinessEvent, BusinessEventStatus } from "@finance-taxation/domain-model";
import {
  analyzeEvent,
  createEvent,
  getEventDetail,
  listEvents,
  listTasks,
  runEventRiskCheck,
  updateEvent,
  type EventDetail
} from "../lib/api";
import {
  useI18n,
  EVENT_TYPE_LABELS,
  EVENT_STATUS_LABELS,
  TASK_STATUS_LABELS,
  TASK_PRIORITY_SHORT,
  DOC_STATUS_LABELS,
  DOC_TYPE_LABELS,
  VOUCHER_STATUS_LABELS,
  VOUCHER_TYPE_LABELS,
  TAX_STATUS_LABELS
} from "../lib/i18n";
import { EVENTS_ENTRY_SUBTITLE } from "../lib/entry-guidance";
import { ProcessFlowCard } from "../features/process-flow/ProcessFlowCard";
import { buildProcessFlowPageContext } from "../features/process-flow/page-context";
import { resolveProcessFlowContext } from "../features/process-flow/resolve";
import { PageHeader } from "../components/ui/PageHeader";
import { HelpPanel, HelpTriggerButton } from "../components/ui/HelpPanel";
import { NextStepBar } from "../components/ui/NextStepBar";
import { PageSkeleton } from "../components/ui/PageSkeleton";
import { ResultBanner } from "../components/ui/ResultBanner";
import { useQueryState } from "../hooks/useQueryState";
import { EventsShell } from "./events/EventsShell";
import { EventListPanel } from "./events/EventListPanel";
import { EventCreatePanel } from "./events/EventCreatePanel";
import { EventDetailPanel } from "./events/EventDetailPanel";
import { AiEventInsights } from "./events/AiEventInsights";
import { deriveContractRevenueSummary } from "./events/contract-revenue-summary";
import { derivePurchaseExceptionSummary } from "./events/purchase-exception-summary";
import { deriveTravelExceptionSummary } from "./events/travel-exception-summary";

const EVENT_TYPE_KEYS = [
  "sales", "procurement", "expense", "payroll",
  "tax", "asset", "financing", "rnd", "general", "purchase_expense", "travel_expense", "contract_revenue"
] as const;

const STATUS_OPTION_KEYS: BusinessEventStatus[] = [
  "draft", "awaiting_documents", "awaiting_approval", "analyzed", "blocked"
];

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

function EventsHelpPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <HelpPanel
      open={open}
      title="经营事项总线 · 业务关系与操作说明"
      onClose={onClose}
      relations={(
        <>
          <strong>经营事项页</strong>是整个流程的起点，负责记录业务背景和 AI 分析结果。后续会把事项拆到<strong>任务中心</strong>推进执行，沉淀到<strong>单据中心</strong>、<strong>凭证中心</strong>和<strong>税务中心</strong>，最终由<strong>风险勾稽中心</strong>做横向检查和闭环跟踪。
        </>
      )}
      workflowSteps={[
        "录入业务描述、金额、部门和发生日期",
        "执行 AI 分析，识别业务类型、生成任务和处理建议",
        "根据分析结果补单据、做凭证、形成税务事项",
        "由任务中心推进执行，必要时触发风险检查",
        "业务完成后进入归档、申报和风险关闭阶段"
      ]}
      responsibility="这里负责定义“发生了什么业务”，并把业务转换成系统内可执行、可追踪的经营事项。它不直接代替单据归档、记账、申报，而是为下游页面提供统一来源。"
      operations="常见操作包括：新建事项、查看 AI 分析结果、更新事项状态、查看任务树、查看流程位置、执行风险检查。若本页描述、金额或类型录入错误，后续单据、凭证和税务结果都会偏移。"
      caution="事项页是业务源头。发现描述不完整、金额错误或类型判断不准时，应先在这里纠正，再继续后续单据、凭证和税务处理。"
    />
  );
}

export function EventsPage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<BusinessEvent[]>([]);
  const [selectedEventIdState, setSelectedEventIdState] = useQueryState("event", "");
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState("idle");
  const [message, setMessage] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [form, setForm] = useState({
    type: "general",
    title: "",
    description: "",
    department: "财务部",
    occurredOn: new Date().toISOString().slice(0, 10),
    amount: "",
    currency: "CNY",
    source: "manual"
  });
  const [statusDraft, setStatusDraft] = useState<BusinessEventStatus>("draft");
  const { t } = useI18n();
  const selectedEventId = selectedEventIdState || null;

  async function loadEvents() {
    setLoading("loading");
    try {
      const payload = await listEvents();
      setEvents(payload.items);
      const targetId = (selectedEventId && payload.items.some((e) => e.id === selectedEventId))
        ? selectedEventId
        : payload.items[0]?.id ?? null;
      setSelectedEventIdState(targetId ?? "");
      setMessage(`已加载 ${payload.total} 条经营事项`);
      if (targetId) {
        const d = await getEventDetail(targetId);
        setDetail(d);
      } else {
        setDetail(null);
        setStatusDraft("draft");
      }
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setLoading("done");
    }
  }

  useEffect(() => { void loadEvents(); }, []);

  useEffect(() => {
    if (detail) {
      setStatusDraft(detail.status);
    }
  }, [detail]);

  async function refreshDetail(eventId: string) {
    const d = await getEventDetail(eventId);
    setDetail(d);
  }

  async function handleCreate() {
    if (!form.title.trim()) return;
    setLoading("saving");
    try {
      const created = await createEvent({ ...form, amount: form.amount || null });
      const payload = await listEvents();
      setEvents(payload.items);
      setSelectedEventIdState(created.id);
      await refreshDetail(created.id);
      setMessage(`已创建：${created.title}`);
      setForm((f) => ({ ...f, title: "", description: "", amount: "" }));
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setLoading("done");
    }
  }

  async function handleAnalyze(eventId: string) {
    setLoading("analyzing");
    try {
      const result = await analyzeEvent(eventId);
      await refreshDetail(eventId);
      const tasks = await listTasks(eventId);
      setMessage(`AI 已生成 ${result.generatedTasks} 个任务，当前共 ${tasks.total} 个`);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setLoading("done");
    }
  }

  async function handleStatusUpdate(eventId: string) {
    setLoading("updating");
    try {
      await updateEvent(eventId, { status: statusDraft });
      await refreshDetail(eventId);
      const payload = await listEvents();
      setEvents(payload.items);
      setMessage(`状态已更新为 ${statusDraft}`);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setLoading("done");
    }
  }

  async function handleRiskCheck(eventId: string) {
    setLoading("updating");
    try {
      const result = await runEventRiskCheck(eventId);
      setMessage(`风险检查完成，生成 ${result.total} 条发现`);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setLoading("done");
    }
  }

  const selectedSummary = useMemo(() => {
    if (!detail) return null;
    return `${t(EVENT_TYPE_LABELS, detail.type)} · ${detail.department} · ${detail.amount || "—"} ${detail.currency}`;
  }, [detail, t]);
  const processFlowContext = useMemo(() => {
    if (!detail) return null;

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
    () => (detail ? derivePurchaseExceptionSummary(detail.type, detail.description) : null),
    [detail]
  );
  const travelExceptionSummary = useMemo(
    () => (detail ? deriveTravelExceptionSummary(detail.type, detail.description) : null),
    [detail]
  );
  const contractRevenueSummary = useMemo(
    () => (detail ? deriveContractRevenueSummary(detail.type, detail.description) : null),
    [detail]
  );
  const exceptionSummary = purchaseExceptionSummary ?? travelExceptionSummary ?? contractRevenueSummary;

  const isBusy = loading !== "done" && loading !== "idle";
  const eventTypeOptions = useMemo(
    () => EVENT_TYPE_KEYS.map((key) => ({ value: key, label: t(EVENT_TYPE_LABELS, key) })),
    [t]
  );
  const eventListItems = useMemo(
    () => events.map((event) => ({
      id: event.id,
      title: event.title,
      typeLabel: t(EVENT_TYPE_LABELS, event.type),
      department: event.department,
      status: event.status,
      statusLabel: t(EVENT_STATUS_LABELS, event.status)
    })),
    [events, t]
  );

  const header = (
    <PageHeader
      title="经营事项总线"
      subtitle={EVENTS_ENTRY_SUBTITLE}
      actions={(
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <HelpTriggerButton onClick={() => setShowHelp(true)} label="查看经营事项页说明" />
        </div>
      )}
    />
  );

  const createPanel = (
    <EventCreatePanel
      form={form}
      isBusy={isBusy}
      isSaving={loading === "saving"}
      options={eventTypeOptions}
      onChange={(next) => setForm((prev) => ({ ...prev, ...next }))}
      onSubmit={() => void handleCreate()}
    />
  );

  const listPanel = (
    <EventListPanel
      count={events.length}
      events={eventListItems}
      selectedEventId={selectedEventId}
      onSelect={(eventId, status) => {
        setSelectedEventIdState(eventId);
        setStatusDraft(status as BusinessEventStatus);
        void refreshDetail(eventId);
      }}
    />
  );

  const detailActions = selectedEventId ? (
    <div className="flex-row">
      <select
        className="form-select"
        style={{ width: "auto" }}
        value={statusDraft}
        onChange={(e) => setStatusDraft(e.target.value as BusinessEventStatus)}
      >
        {STATUS_OPTION_KEYS.map((s) => <option key={s} value={s}>{t(EVENT_STATUS_LABELS, s)}</option>)}
      </select>
      <button
        className="btn btn-outline btn-sm"
        onClick={() => void handleAnalyze(selectedEventId)}
        disabled={isBusy}
      >
        AI 拆解
      </button>
      <button
        className="btn btn-outline btn-sm"
        onClick={() => void handleRiskCheck(selectedEventId)}
        disabled={isBusy}
      >
        风险检查
      </button>
      <button
        className="btn btn-primary btn-sm"
        onClick={() => void handleStatusUpdate(selectedEventId)}
        disabled={isBusy}
      >
        更新状态
      </button>
    </div>
  ) : undefined;

  if (loading === "loading") {
    return <PageSkeleton variant="detail" rows={6} />;
  }

  return (
    <>
      <EventsHelpPanel open={showHelp} onClose={() => setShowHelp(false)} />
      <EventsShell
        header={header}
        banner={message ? <ResultBanner tone="info" message={message} /> : null}
        createPanel={createPanel}
        listPanel={listPanel}
        detailPanel={(
          <EventDetailPanel
            title={detail ? detail.title : "经营事项详情"}
            subtitle={selectedSummary ?? undefined}
            actions={detailActions}
          >
        {detail ? (
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
        ) : (
          <div className="state-empty">请从左侧列表选择一条经营事项</div>
        )}
          </EventDetailPanel>
        )}
      />
      <NextStepBar
        current="事项已记录，财务会接着处理（无需您盯着每一步）"
        next={[
          { label: "看进展", path: "/tasks", hint: "看这件事后续的处理任务走到哪一步了" },
          { label: "传票据", path: "/bills", hint: "有发票、收据、回单就传上来，财务处理更快" },
          { label: "问 AI", path: "/assistant", hint: "不确定下一步做什么？用大白话直接问" },
        ]}
      />
    </>
  );
}
