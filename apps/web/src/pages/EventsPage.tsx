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

const EVENT_TYPE_KEYS = [
  "sales", "procurement", "expense", "payroll",
  "tax", "asset", "financing", "rnd", "general"
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

export function EventsPage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<BusinessEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState("idle");
  const [message, setMessage] = useState("");
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

  async function loadEvents() {
    setLoading("loading");
    try {
      const payload = await listEvents();
      setEvents(payload.items);
      const first = payload.items[0]?.id ?? null;
      setSelectedEventId(first);
      setMessage(`已加载 ${payload.total} 条经营事项`);
      if (first) {
        const d = await getEventDetail(first);
        setDetail(d);
      }
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setLoading("done");
    }
  }

  useEffect(() => { void loadEvents(); }, []);

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
      setSelectedEventId(created.id);
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

  const isBusy = loading !== "done" && loading !== "idle";

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="page-header">
        <div>
          <div className="page-title">经营事项总线</div>
          <div className="page-subtitle">登记、分析与跟踪所有经营事项</div>
        </div>
        {message && <span className="badge badge-blue">{message}</span>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 20 }}>
        {/* 新建表单 */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">新建经营事项</span>
          </div>
          <div className="card-body">
            <div className="grid-2" style={{ gap: 12 }}>
              <div className="form-group">
                <label className="form-label">类型</label>
                <select
                  className="form-select"
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                >
                  {EVENT_TYPE_KEYS.map((k) => <option key={k} value={k}>{t(EVENT_TYPE_LABELS, k)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">部门</label>
                <input
                  className="form-input"
                  value={form.department}
                  onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                />
              </div>
              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label className="form-label">标题</label>
                <input
                  className="form-input"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="请输入事项标题"
                />
              </div>
              <div className="form-group" style={{ gridColumn: "1 / -1" }}>
                <label className="form-label">描述</label>
                <textarea
                  className="form-textarea"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  placeholder="请输入事项描述"
                />
              </div>
              <div className="form-group">
                <label className="form-label">发生日期</label>
                <input
                  className="form-input"
                  type="date"
                  value={form.occurredOn}
                  onChange={(e) => setForm((f) => ({ ...f, occurredOn: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">金额</label>
                <input
                  className="form-input"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="选填"
                />
              </div>
            </div>
            <div className="mt-16">
              <button
                className="btn btn-primary"
                onClick={() => void handleCreate()}
                disabled={isBusy || !form.title.trim()}
              >
                {loading === "saving" ? "创建中…" : "创建事项"}
              </button>
            </div>
          </div>
        </div>

        {/* 事项列表 */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">经营事项列表</span>
            <span className="badge badge-gray">{events.length}</span>
          </div>
          <div className="card-body" style={{ padding: "8px 12px", maxHeight: 480, overflowY: "auto" }}>
            {events.length === 0 ? (
              <div className="state-empty">暂无事项</div>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {events.map((evt) => (
                  <button
                    key={evt.id}
                    onClick={() => {
                      setSelectedEventId(evt.id);
                      void refreshDetail(evt.id);
                    }}
                    style={{
                      textAlign: "left",
                      padding: "12px 14px",
                      borderRadius: "var(--r-lg)",
                      border: evt.id === selectedEventId
                        ? "1px solid var(--c-primary)"
                        : "1px solid var(--c-border)",
                      background: evt.id === selectedEventId
                        ? "var(--c-primary-light)"
                        : "var(--c-surface)",
                      cursor: "pointer",
                      width: "100%"
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{evt.title}</div>
                    <div className="flex-row mt-4">
                      <span className={statusBadge(evt.status)}>{t(EVENT_STATUS_LABELS, evt.status)}</span>
                      <span className="text-muted text-sm">{t(EVENT_TYPE_LABELS, evt.type)} · {evt.department}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 事项详情 */}
      <div className="card">
        <div className="card-header">
          <div>
            <span className="card-title">
              {detail ? detail.title : "经营事项详情"}
            </span>
            {selectedSummary && (
              <div className="text-muted text-sm mt-4">{selectedSummary}</div>
            )}
          </div>
          {selectedEventId && (
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
          )}
        </div>

        {detail ? (
          <div className="card-body">
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
                    <button className="btn btn-outline btn-xs mt-8" onClick={() => navigate("/documents")}>
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
                    <button className="btn btn-outline btn-xs mt-8" onClick={() => navigate("/vouchers")}>
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
      </div>
    </div>
  );
}
