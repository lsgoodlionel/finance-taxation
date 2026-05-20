import { useEffect, useRef, useState } from "react";
import type { BusinessEvent, RiskClosureRecord, RiskFinding } from "@finance-taxation/domain-model";
import {
  closeRiskFinding,
  listEvents,
  listRiskClosureRecords,
  listRiskFindings,
  runEventRiskCheck
} from "../lib/api";
import { useI18n, RISK_SEVERITY_LABELS, RISK_PRIORITY_LABELS, RISK_STATUS_LABELS } from "../lib/i18n";

function RiskHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: "16px", padding: "28px 32px", maxWidth: "560px", width: "92%", boxShadow: "0 8px 40px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>风险勾稽中心 · 操作说明</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "#9aa5b4" }}>✕</button>
        </div>
        <div style={{ display: "grid", gap: "14px", fontSize: "13.5px", lineHeight: 1.75 }}>
          <div style={{ background: "rgba(79,142,247,0.06)", borderRadius: "10px", padding: "14px 16px", border: "1px solid rgba(79,142,247,0.2)" }}>
            <strong>事项编号格式说明</strong><br />
            页面中类似 <code style={{ background: "#f0f4ff", padding: "1px 5px", borderRadius: "4px", fontSize: "12px" }}>evt-1779179888495</code> 的编号是系统自动生成的<strong>经营事项唯一标识</strong>。<br />
            其中 <code style={{ background: "#f0f4ff", padding: "1px 5px", borderRadius: "4px" }}>1779179888495</code> 是事项创建时刻的 Unix 毫秒时间戳，代表该事项的精确创建时间，确保全局唯一。您可在经营事项列表中通过此编号找到对应事项。
          </div>
          <div><strong>业务流程</strong>
            <ol style={{ margin: "6px 0 0 18px", padding: 0 }}>
              <li>在"输入事项编号"框中粘贴或输入经营事项编号（如 evt-xxx）</li>
              <li>点击「执行风险检查」，系统对该事项进行多维度自动合规评估</li>
              <li>检查结果以"风险发现"形式列出，包含规则说明、严重程度和整改建议</li>
              <li>问题处理完毕后，选中发现记录并填写"关闭说明"，点击「关闭风险」归档</li>
            </ol>
          </div>
          <div><strong>风险严重级别</strong>
            <div style={{ display: "grid", gap: "4px", marginTop: "6px" }}>
              {[["致命", "#dc2626", "重大合规违规，必须立即处理"], ["高危", "#d97706", "存在较高财税风险，建议优先整改"], ["中危", "#2563eb", "存在潜在风险，建议关注并评估"], ["低危", "#6c7a89", "轻微问题，酌情处理"]].map(([label, color, desc]) => (
                <div key={label} style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                  <span style={{ color, fontWeight: 700, minWidth: "32px" }}>{label}</span>
                  <span>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function panelStyle() {
  return {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)",
    padding: "24px"
  } as const;
}

function cellStyle() {
  return {
    borderBottom: "1px solid rgba(20,40,60,0.08)",
    padding: "10px 8px",
    textAlign: "left" as const,
    verticalAlign: "top" as const
  };
}

export function RiskPage() {
  const { t } = useI18n();
  const [findings, setFindings] = useState<RiskFinding[]>([]);
  const [closureRecords, setClosureRecords] = useState<RiskClosureRecord[]>([]);
  const [selectedFindingId, setSelectedFindingId] = useState("");
  const [eventId, setEventId] = useState("");
  const [events, setEvents] = useState<BusinessEvent[]>([]);
  const [eventSearch, setEventSearch] = useState("");
  const [showEventDropdown, setShowEventDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [resolution, setResolution] = useState("已复核并完成整改。");
  const [message, setMessage] = useState("正在准备风险勾稽。");
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    async function bootstrap() {
      try {
        const [eventsPayload, findingsPayload] = await Promise.all([
          listEvents(),
          listRiskFindings()
        ]);
        setEvents(eventsPayload.items);
        const firstId = eventsPayload.items[0]?.id || "";
        setEventId(firstId);
        setEventSearch(eventsPayload.items[0]?.title || firstId);
        setFindings(findingsPayload.items);
        setSelectedFindingId(findingsPayload.items[0]?.id || "");
        setMessage(`已加载 ${findingsPayload.total} 条风险发现。`);
      } catch (error) {
        setMessage((error as Error).message);
      }
    }
    void bootstrap();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowEventDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function refreshFindings() {
    const payload = await listRiskFindings();
    setFindings(payload.items);
    setMessage(`已刷新 ${payload.total} 条风险发现。`);
  }

  async function loadClosureRecords(findingId: string) {
    const payload = await listRiskClosureRecords(findingId);
    setClosureRecords(payload.items);
    setSelectedFindingId(findingId);
  }

  return (
    <section style={{ display: "grid", gap: "20px" }}>
      {showHelp && <RiskHelpModal onClose={() => setShowHelp(false)} />}
      <article style={panelStyle()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
          <h2 style={{ margin: 0 }}>风险勾稽中心</h2>
          <button onClick={() => setShowHelp(true)} title="操作说明" style={{ width: "26px", height: "26px", borderRadius: "50%", border: "1.5px solid rgba(79,142,247,0.6)", background: "rgba(79,142,247,0.08)", color: "#4f8ef7", fontWeight: 700, fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>?</button>
        </div>
        <p style={{ margin: "0 0 12px" }}>{message}</p>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" }}>
          {/* 事项选择器 */}
          <div ref={dropdownRef} style={{ position: "relative", flex: 2, minWidth: "200px" }}>
            <label style={{ fontSize: "12px", color: "#6c7a89", display: "block", marginBottom: "4px" }}>选择经营事项</label>
            <input
              value={eventSearch}
              onChange={(e) => { setEventSearch(e.target.value); setShowEventDropdown(true); }}
              onFocus={() => setShowEventDropdown(true)}
              placeholder="点击选择或搜索事项…"
              style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(20,40,60,0.2)", boxSizing: "border-box", fontSize: "13px" }}
            />
            {showEventDropdown && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
                background: "#fff", border: "1px solid rgba(20,40,60,0.15)", borderRadius: "8px",
                boxShadow: "0 4px 20px rgba(0,0,0,0.12)", maxHeight: "220px", overflowY: "auto",
                marginTop: "4px"
              }}>
                {events
                  .filter((ev) => {
                    const q = eventSearch.toLowerCase();
                    return !q || ev.title.toLowerCase().includes(q) || ev.id.toLowerCase().includes(q);
                  })
                  .map((ev) => (
                    <div
                      key={ev.id}
                      onClick={() => {
                        setEventId(ev.id);
                        setEventSearch(ev.title);
                        setShowEventDropdown(false);
                      }}
                      style={{
                        padding: "9px 14px", cursor: "pointer", fontSize: "13px",
                        borderBottom: "1px solid rgba(20,40,60,0.05)",
                        background: ev.id === eventId ? "rgba(79,142,247,0.07)" : "transparent",
                        color: ev.id === eventId ? "#2563eb" : "#1e2a37"
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "rgba(20,40,60,0.04)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = ev.id === eventId ? "rgba(79,142,247,0.07)" : "transparent"; }}
                    >
                      <div style={{ fontWeight: 500 }}>{ev.title}</div>
                      <div style={{ fontSize: "11px", color: "#9aa5b4", marginTop: "2px" }}>{ev.id}</div>
                    </div>
                  ))
                }
                {events.filter((ev) => {
                  const q = eventSearch.toLowerCase();
                  return !q || ev.title.toLowerCase().includes(q) || ev.id.toLowerCase().includes(q);
                }).length === 0 && (
                  <div style={{ padding: "12px 14px", fontSize: "13px", color: "#9aa5b4" }}>无匹配事项</div>
                )}
              </div>
            )}
            {eventId && (
              <div style={{ fontSize: "11px", color: "#6c7a89", marginTop: "4px" }}>
                已选：<code style={{ background: "#f0f4ff", padding: "1px 5px", borderRadius: "4px" }}>{eventId}</code>
              </div>
            )}
          </div>

          <div style={{ flex: 2, minWidth: "160px" }}>
            <label style={{ fontSize: "12px", color: "#6c7a89", display: "block", marginBottom: "4px" }}>关闭说明</label>
            <input value={resolution} onChange={(event) => setResolution(event.target.value)} placeholder="关闭说明" style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(20,40,60,0.2)", boxSizing: "border-box", fontSize: "13px" }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <div style={{ fontSize: "12px", color: "transparent", marginBottom: "4px" }}>操作</div>
            <button
              onClick={() =>
                void runEventRiskCheck(eventId)
                  .then(() => refreshFindings())
                  .catch((error) => setMessage((error as Error).message))
              }
              disabled={!eventId}
              style={{ padding: "8px 18px", borderRadius: "8px", cursor: eventId ? "pointer" : "default", fontSize: "13px", opacity: eventId ? 1 : 0.5 }}
            >
              执行风险检查
            </button>
          </div>
        </div>
      </article>
      <article style={panelStyle()}>
        <h3 style={{ marginTop: 0 }}>风险发现</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={cellStyle()}>规则</th>
              <th style={cellStyle()}>严重级别</th>
              <th style={cellStyle()}>评分</th>
              <th style={cellStyle()}>优先级</th>
              <th style={cellStyle()}>事项</th>
              <th style={cellStyle()}>标题</th>
              <th style={cellStyle()}>说明</th>
            </tr>
          </thead>
          <tbody>
            {findings.map((finding) => (
              <tr key={finding.id}>
                <td style={cellStyle()}>{finding.ruleCode}</td>
                <td style={cellStyle()}>{t(RISK_SEVERITY_LABELS, finding.severity)}</td>
                <td style={cellStyle()}>{finding.score ?? "—"}</td>
                <td style={cellStyle()}>{finding.priority ? t(RISK_PRIORITY_LABELS, finding.priority) : "—"}</td>
                <td style={cellStyle()}>{finding.businessEventId || "—"}</td>
                <td style={cellStyle()}>{finding.title}</td>
                <td style={cellStyle()}>
                  <div>{finding.detail}</div>
                  <button
                    style={{ marginTop: "8px", marginRight: "8px" }}
                    onClick={() =>
                      void loadClosureRecords(finding.id).catch((error) => setMessage((error as Error).message))
                    }
                  >
                    查看复盘
                  </button>
                  {finding.status !== "resolved" ? (
                    <button
                      style={{ marginTop: "8px" }}
                      onClick={() =>
                        void closeRiskFinding(finding.id, resolution)
                          .then(() => Promise.all([refreshFindings(), loadClosureRecords(finding.id)]))
                          .catch((error) => setMessage((error as Error).message))
                      }
                    >
                      标记已关闭
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
      <article style={panelStyle()}>
        <h3 style={{ marginTop: 0 }}>异常关闭与复盘记录</h3>
        <p>当前查看：{selectedFindingId || "未选择风险发现"}</p>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={cellStyle()}>复盘编号</th>
              <th style={cellStyle()}>关闭人</th>
              <th style={cellStyle()}>关闭说明</th>
              <th style={cellStyle()}>复核时间</th>
            </tr>
          </thead>
          <tbody>
            {closureRecords.length ? closureRecords.map((record) => (
              <tr key={record.id}>
                <td style={cellStyle()}>{record.id}</td>
                <td style={cellStyle()}>{record.closedByName}</td>
                <td style={cellStyle()}>{record.resolution}</td>
                <td style={cellStyle()}>{record.reviewedAt}</td>
              </tr>
            )) : (
              <tr>
                <td style={cellStyle()} colSpan={4}>暂无关闭记录。</td>
              </tr>
            )}
          </tbody>
        </table>
      </article>
    </section>
  );
}
