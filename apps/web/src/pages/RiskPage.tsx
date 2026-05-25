import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import type { BusinessEvent, RiskClosureRecord, RiskFinding } from "@finance-taxation/domain-model";
import {
  closeRiskFinding,
  listEvents,
  listRiskClosureRecords,
  listRiskFindings,
  runEventRiskCheck
} from "../lib/api";
import { useI18n, RISK_SEVERITY_LABELS, RISK_PRIORITY_LABELS, RISK_STATUS_LABELS } from "../lib/i18n";
import { ProcessFlowStageSection } from "../features/process-flow/ProcessFlowStageSection";
import { filterContractRiskFindings } from "./contract-drilldown";

function RiskHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: "16px", padding: "28px 32px", maxWidth: "560px", width: "92%", boxShadow: "0 8px 40px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>风险勾稽中心 · 业务关系与操作说明</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "#9aa5b4" }}>✕</button>
        </div>
        <div style={{ display: "grid", gap: "14px", fontSize: "13.5px", lineHeight: 1.75 }}>
          <div style={{ background: "rgba(79,142,247,0.06)", borderRadius: "10px", padding: "14px 16px", border: "1px solid rgba(79,142,247,0.2)" }}>
            <strong>相关页面的关系</strong><br />
            <strong>经营事项页</strong>给出业务背景，<strong>任务中心</strong>推进执行，<strong>单据中心</strong>和<strong>凭证中心</strong>提供依据，<strong>税务中心</strong>提供申报结果。<strong>风险勾稽中心</strong>负责从这些页面中找出不一致、不完整或不合规的问题，并跟踪关闭。
          </div>
          <div><strong>标准业务流程</strong>
            <ol style={{ margin: "6px 0 0 18px", padding: 0 }}>
              <li>系统基于事项、任务、单据、凭证、税务结果生成风险检查线索</li>
              <li>在本页执行风险检查，生成风险发现</li>
              <li>根据发现回到上游页面整改</li>
              <li>整改完成后在本页关闭风险并记录复盘</li>
            </ol>
          </div>
          <div><strong>本页负责什么</strong>
            <div>这里不产生原始业务资料，也不直接记账申报，而是做横向核查。重点是发现“该做没做、该有没补、口径不一致、申报不完整”的问题，并推动闭环。</div>
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
          <div style={{ background: "rgba(255,165,0,0.08)", borderRadius: "8px", padding: "10px 14px", fontSize: "12.5px", color: "#b45309" }}>
            ⚠️ 风险页不负责直接修复问题。发现风险后，应回到事项、任务、单据、凭证或税务页面完成整改，再回来关闭风险。
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
  const location = useLocation();
  const navState = (location.state as { businessEventId?: string; contractId?: string } | null) ?? null;
  const navEventId = navState?.businessEventId ?? null;
  const navContractId = navState?.contractId ?? null;
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
        const scopedEvents = navContractId
          ? eventsPayload.items.filter((item) => item.contractId === navContractId)
          : eventsPayload.items;
        const preferredEvent = navEventId
          ? eventsPayload.items.find((item) => item.id === navEventId) ?? null
          : null;
        const firstId = preferredEvent?.id || scopedEvents[0]?.id || eventsPayload.items[0]?.id || "";
        setEventId(firstId);
        setEventSearch(preferredEvent?.title || scopedEvents[0]?.title || eventsPayload.items[0]?.title || firstId);
        setFindings(findingsPayload.items);
        const scopedFindings = navContractId
          ? filterContractRiskFindings(findingsPayload.items, eventsPayload.items, navContractId)
          : findingsPayload.items;
        const preferredFinding = navEventId
          ? findingsPayload.items.find((item) => item.businessEventId === navEventId) ?? null
          : scopedFindings[0] ?? null;
        setSelectedFindingId(preferredFinding?.id || findingsPayload.items[0]?.id || "");
        setMessage(
          `${navContractId ? `当前合同 ${navContractId}：` : navEventId ? `当前事项 ${navEventId}：` : ""}已加载 ${findingsPayload.total} 条风险发现。`
        );
      } catch (error) {
        setMessage((error as Error).message);
      }
    }
    void bootstrap();
  }, [navContractId, navEventId]);

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
    setMessage(`${navContractId ? `当前合同 ${navContractId}：` : navEventId ? `当前事项 ${navEventId}：` : ""}已刷新 ${payload.total} 条风险发现。`);
  }

  async function loadClosureRecords(findingId: string) {
    const payload = await listRiskClosureRecords(findingId);
    setClosureRecords(payload.items);
    setSelectedFindingId(findingId);
  }

  const visibleFindings = useMemo(() => {
    const scopedByContract = navContractId
      ? filterContractRiskFindings(findings, events, navContractId)
      : findings;
    return navEventId ? scopedByContract.filter((finding) => finding.businessEventId === navEventId) : scopedByContract;
  }, [events, findings, navContractId, navEventId]);

  const visibleEvents = useMemo(
    () => (navContractId ? events.filter((event) => event.contractId === navContractId) : events),
    [events, navContractId]
  );

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
                {visibleEvents
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
                {visibleEvents.filter((ev) => {
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
      <ProcessFlowStageSection
        title="风险检查流程回看"
        subtitle="风险检查主要来源于 AI 初判与资料校验阶段，并会联动事项、凭证和税务处理结果。当前页可从两类业务主线回看风险来源并跳转到相关业务页面。"
        currentNodeId="ai_precheck"
        branch={null}
        businessEventId={eventId || undefined}
      />
      <article style={panelStyle()}>
        <h3 style={{ marginTop: 0 }}>
          风险发现{navEventId ? `（当前事项 ${navEventId}）` : ""}
        </h3>
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
            {visibleFindings.map((finding) => (
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
            {visibleFindings.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ ...cellStyle(), textAlign: "center", color: "#9aa5b4", padding: "24px" }}>
                  当前筛选范围内暂无风险发现
                </td>
              </tr>
            ) : null}
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
