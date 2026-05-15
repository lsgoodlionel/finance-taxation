import { useEffect, useMemo, useState } from "react";
import type { BusinessEvent, BusinessEventStatus } from "@finance-taxation/domain-model";
import {
  analyzeEvent,
  createEvent,
  getEventDetail,
  listEvents,
  listTasks,
  login,
  refreshSession,
  runEventRiskCheck,
  updateEvent,
  type EventDetail
} from "../lib/api";

const eventTypes = [
  "sales",
  "procurement",
  "expense",
  "payroll",
  "tax",
  "asset",
  "financing",
  "rnd",
  "general"
] as const;

function panelStyle() {
  return {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)",
    padding: "24px"
  } as const;
}

function renderTaskTree(nodes: EventDetail["taskTree"]) {
  if (!nodes.length) {
    return <p>当前还没有任务。</p>;
  }
  return (
    <ul style={{ paddingLeft: "22px", lineHeight: 1.8 }}>
      {nodes.map((node) => (
        <li key={node.id}>
          {node.title} | {node.status} | {node.priority}
          {node.children.length ? renderTaskTree(node.children) : null}
        </li>
      ))}
    </ul>
  );
}

function tableStyle() {
  return {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: "14px"
  };
}

function cellStyle() {
  return {
    borderBottom: "1px solid rgba(20,40,60,0.08)",
    padding: "10px 8px",
    textAlign: "left" as const,
    verticalAlign: "top" as const
  };
}

export function EventsPage() {
  const [events, setEvents] = useState<BusinessEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState("idle");
  const [message, setMessage] = useState("尚未加载经营事项。");
  const [form, setForm] = useState({
    type: "general",
    title: "",
    description: "",
    department: "财务部",
    occurredOn: "2026-05-14",
    amount: "",
    currency: "CNY",
    source: "manual"
  });
  const [statusDraft, setStatusDraft] = useState<BusinessEventStatus>("draft");

  async function bootstrap() {
    setLoading("loading");
    try {
      await login("chairman", "123456");
      await refreshSession();
      const payload = await listEvents();
      setEvents(payload.items);
      const first = payload.items[0]?.id || null;
      setSelectedEventId(first);
      setMessage(`已加载 ${payload.total} 条经营事项。`);
      if (first) {
        const detailPayload = await getEventDetail(first);
        setDetail(detailPayload);
      }
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading("done");
    }
  }

  useEffect(() => {
    void bootstrap();
  }, []);

  async function refreshDetail(eventId: string) {
    const payload = await getEventDetail(eventId);
    setDetail(payload);
  }

  async function handleCreate() {
    setLoading("saving");
    try {
      const created = await createEvent({
        ...form,
        amount: form.amount || null
      });
      const payload = await listEvents();
      setEvents(payload.items);
      setSelectedEventId(created.id);
      await refreshDetail(created.id);
      setMessage(`已创建经营事项：${created.title}`);
      setForm((current) => ({ ...current, title: "", description: "", amount: "" }));
    } catch (error) {
      setMessage((error as Error).message);
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
      setMessage(`AI 已为该事项生成 ${result.generatedTasks} 个任务，当前任务数 ${tasks.total}。`);
    } catch (error) {
      setMessage((error as Error).message);
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
      setMessage(`事项状态已更新为 ${statusDraft}。`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading("done");
    }
  }

  async function handleRiskCheck(eventId: string) {
    setLoading("updating");
    try {
      const result = await runEventRiskCheck(eventId);
      setMessage(`已完成风险检查，生成 ${result.total} 条风险发现。`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading("done");
    }
  }

  const selectedSummary = useMemo(() => {
    if (!detail) return "请选择一条经营事项。";
    return `${detail.title} | ${detail.type} | ${detail.status} | ${detail.amount || "未填金额"} ${detail.currency}`;
  }, [detail]);

  return (
    <section style={{ display: "grid", gap: "20px" }}>
      <article style={panelStyle()}>
        <h2 style={{ marginTop: 0 }}>Phase 1 经营事项总线</h2>
        <p style={{ lineHeight: 1.8, marginBottom: "12px" }}>
          当前页面已接入最小闭环：登录、经营事项列表、创建、详情、AI 任务拆解。
        </p>
        <div style={{ color: "#4d5d6c" }}>{message}</div>
      </article>

      <section style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "20px" }}>
        <article style={panelStyle()}>
          <h3 style={{ marginTop: 0 }}>新建经营事项</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <label>
              类型
              <select
                value={form.type}
                onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}
                style={{ display: "block", width: "100%", marginTop: "6px" }}
              >
                {eventTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label>
              部门
              <input
                value={form.department}
                onChange={(event) =>
                  setForm((current) => ({ ...current, department: event.target.value }))
                }
                style={{ display: "block", width: "100%", marginTop: "6px" }}
              />
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              标题
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                style={{ display: "block", width: "100%", marginTop: "6px" }}
              />
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              描述
              <textarea
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
                rows={4}
                style={{ display: "block", width: "100%", marginTop: "6px" }}
              />
            </label>
            <label>
              日期
              <input
                value={form.occurredOn}
                onChange={(event) =>
                  setForm((current) => ({ ...current, occurredOn: event.target.value }))
                }
                style={{ display: "block", width: "100%", marginTop: "6px" }}
              />
            </label>
            <label>
              金额
              <input
                value={form.amount}
                onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                style={{ display: "block", width: "100%", marginTop: "6px" }}
              />
            </label>
          </div>
          <button
            onClick={() => void handleCreate()}
            disabled={loading !== "done" && loading !== "idle"}
            style={{ marginTop: "16px" }}
          >
            创建事项
          </button>
        </article>

        <article style={panelStyle()}>
          <h3 style={{ marginTop: 0 }}>经营事项列表</h3>
          <div style={{ display: "grid", gap: "10px" }}>
            {events.map((event) => (
              <button
                key={event.id}
                onClick={() => {
                  setSelectedEventId(event.id);
                  void refreshDetail(event.id);
                }}
                style={{
                  textAlign: "left",
                  borderRadius: "16px",
                  border: event.id === selectedEventId ? "1px solid #1e2a37" : "1px solid rgba(20,40,60,0.08)",
                  background: event.id === selectedEventId ? "rgba(30,42,55,0.08)" : "#ffffff",
                  padding: "14px"
                }}
              >
                <div style={{ fontWeight: 700 }}>{event.title}</div>
                <div style={{ fontSize: "14px", color: "#4d5d6c", marginTop: "4px" }}>
                  {event.type} | {event.department} | {event.status}
                </div>
              </button>
            ))}
          </div>
        </article>
      </section>

      <article style={panelStyle()}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
          <div>
            <h3 style={{ marginTop: 0 }}>经营事项详情</h3>
            <div style={{ color: "#4d5d6c" }}>{selectedSummary}</div>
          </div>
          {selectedEventId ? (
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <select
                value={statusDraft}
                onChange={(event) => setStatusDraft(event.target.value as BusinessEventStatus)}
              >
                <option value="draft">draft</option>
                <option value="awaiting_documents">awaiting_documents</option>
                <option value="awaiting_approval">awaiting_approval</option>
                <option value="analyzed">analyzed</option>
                <option value="blocked">blocked</option>
              </select>
              <button onClick={() => void handleAnalyze(selectedEventId)} disabled={loading === "analyzing"}>
                触发 AI 任务拆解
              </button>
              <button onClick={() => void handleRiskCheck(selectedEventId)} disabled={loading === "updating"}>
                执行风险检查
              </button>
              <button onClick={() => void handleStatusUpdate(selectedEventId)} disabled={loading === "updating"}>
                更新状态
              </button>
            </div>
          ) : null}
        </div>
        {detail ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "20px" }}>
            <section>
              <h4>事项描述</h4>
              <p style={{ lineHeight: 1.8 }}>{detail.description}</p>
              <h4>关联对象</h4>
              {detail.relations.length ? (
                <ul style={{ paddingLeft: "22px", lineHeight: 1.8 }}>
                  {detail.relations.map((relation) => (
                    <li key={relation.id}>
                      {relation.relationType} / {relation.label}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>当前还没有建立关联对象。</p>
              )}
              <h4 style={{ marginTop: "18px" }}>单据映射</h4>
              {detail.documentMappings.length ? (
                <table style={tableStyle()}>
                  <thead>
                    <tr>
                      <th style={cellStyle()}>类型</th>
                      <th style={cellStyle()}>单据</th>
                      <th style={cellStyle()}>状态</th>
                      <th style={cellStyle()}>责任部门</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.documentMappings.map((item) => (
                      <tr key={item.id}>
                        <td style={cellStyle()}>{item.documentType}</td>
                        <td style={cellStyle()}>
                          <div>{item.title}</div>
                          <div style={{ color: "#4d5d6c", marginTop: "4px" }}>{item.notes}</div>
                        </td>
                        <td style={cellStyle()}>{item.status}</td>
                        <td style={cellStyle()}>{item.ownerDepartment}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>当前还没有单据映射。</p>
              )}
              <h4 style={{ marginTop: "18px" }}>已生成单据对象</h4>
              {detail.generatedDocuments.length ? (
                <table style={tableStyle()}>
                  <thead>
                    <tr>
                      <th style={cellStyle()}>编号</th>
                      <th style={cellStyle()}>名称</th>
                      <th style={cellStyle()}>状态</th>
                      <th style={cellStyle()}>责任部门</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.generatedDocuments.map((item) => (
                      <tr key={item.id}>
                        <td style={cellStyle()}>{item.id}</td>
                        <td style={cellStyle()}>{item.title}</td>
                        <td style={cellStyle()}>{item.status}</td>
                        <td style={cellStyle()}>{item.ownerDepartment}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>当前还没有正式单据对象。</p>
              )}
              <h4 style={{ marginTop: "18px" }}>税务处理映射</h4>
              {detail.taxMappings.length ? (
                <table style={tableStyle()}>
                  <thead>
                    <tr>
                      <th style={cellStyle()}>税种</th>
                      <th style={cellStyle()}>处理建议</th>
                      <th style={cellStyle()}>状态</th>
                      <th style={cellStyle()}>申报期</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.taxMappings.map((item) => (
                      <tr key={item.id}>
                        <td style={cellStyle()}>{item.taxType}</td>
                        <td style={cellStyle()}>
                          <div>{item.treatment}</div>
                          <div style={{ color: "#4d5d6c", marginTop: "4px" }}>{item.basis}</div>
                        </td>
                        <td style={cellStyle()}>{item.status}</td>
                        <td style={cellStyle()}>{item.filingPeriod}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>当前还没有税务映射。</p>
              )}
              <h4 style={{ marginTop: "18px" }}>已生成税务事项</h4>
              {detail.taxItems.length ? (
                <table style={tableStyle()}>
                  <thead>
                    <tr>
                      <th style={cellStyle()}>编号</th>
                      <th style={cellStyle()}>税种</th>
                      <th style={cellStyle()}>状态</th>
                      <th style={cellStyle()}>申报期</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.taxItems.map((item) => (
                      <tr key={item.id}>
                        <td style={cellStyle()}>{item.id}</td>
                        <td style={cellStyle()}>{item.taxType}</td>
                        <td style={cellStyle()}>{item.status}</td>
                        <td style={cellStyle()}>{item.filingPeriod}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>当前还没有正式税务事项。</p>
              )}
            </section>
            <section>
              <h4>任务树</h4>
              {renderTaskTree(detail.taskTree)}
              <h4 style={{ marginTop: "18px" }}>凭证草稿</h4>
              {detail.voucherDrafts.length ? (
                <div style={{ display: "grid", gap: "14px" }}>
                  {detail.voucherDrafts.map((voucher) => (
                    <article
                      key={voucher.id}
                      style={{
                        border: "1px solid rgba(20,40,60,0.08)",
                        borderRadius: "16px",
                        padding: "14px"
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>
                        {voucher.summary} | {voucher.voucherType} | {voucher.status}
                      </div>
                      <table style={{ ...tableStyle(), marginTop: "10px" }}>
                        <thead>
                          <tr>
                            <th style={cellStyle()}>摘要</th>
                            <th style={cellStyle()}>科目编码</th>
                            <th style={cellStyle()}>科目名称</th>
                            <th style={cellStyle()}>借方</th>
                            <th style={cellStyle()}>贷方</th>
                          </tr>
                        </thead>
                        <tbody>
                          {voucher.lines.map((line) => (
                            <tr key={line.id}>
                              <td style={cellStyle()}>{line.summary}</td>
                              <td style={cellStyle()}>{line.accountCode}</td>
                              <td style={cellStyle()}>{line.accountName}</td>
                              <td style={cellStyle()}>{line.debit}</td>
                              <td style={cellStyle()}>{line.credit}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </article>
                  ))}
                </div>
              ) : (
                <p>当前还没有凭证草稿。</p>
              )}
              <h4 style={{ marginTop: "18px" }}>已生成凭证对象</h4>
              {detail.vouchers.length ? (
                <table style={tableStyle()}>
                  <thead>
                    <tr>
                      <th style={cellStyle()}>编号</th>
                      <th style={cellStyle()}>摘要</th>
                      <th style={cellStyle()}>类型</th>
                      <th style={cellStyle()}>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.vouchers.map((item) => (
                      <tr key={item.id}>
                        <td style={cellStyle()}>{item.id}</td>
                        <td style={cellStyle()}>{item.summary}</td>
                        <td style={cellStyle()}>{item.voucherType}</td>
                        <td style={cellStyle()}>{item.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>当前还没有正式凭证对象。</p>
              )}
              {detail.mappingGeneratedAt ? (
                <p style={{ color: "#4d5d6c", marginTop: "10px" }}>
                  映射生成时间：{detail.mappingGeneratedAt}
                </p>
              ) : null}
              <h4 style={{ marginTop: "18px" }}>活动时间轴</h4>
              {detail.activities.length ? (
                <ul style={{ paddingLeft: "22px", lineHeight: 1.8 }}>
                  {detail.activities.map((activity) => (
                    <li key={activity.id}>
                      {activity.createdAt} | {activity.actorName} | {activity.summary}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>当前还没有活动记录。</p>
              )}
            </section>
          </div>
        ) : (
          <p style={{ marginTop: "20px" }}>尚未选择事项。</p>
        )}
      </article>
    </section>
  );
}
