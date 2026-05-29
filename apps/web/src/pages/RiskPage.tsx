import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { BusinessEvent, RiskClosureRecord, RiskFinding } from "@finance-taxation/domain-model";
import {
  closeRiskFinding,
  listEvents,
  listRiskClosureRecords,
  listRiskFindings,
  runEventRiskCheck
} from "../lib/api";
import { ProcessFlowStageSection } from "../features/process-flow/ProcessFlowStageSection";
import { useI18n, RISK_PRIORITY_LABELS, RISK_SEVERITY_LABELS, RISK_STATUS_LABELS } from "../lib/i18n";
import { buildRiskClosureTargetChain, normalizeDrilldownState } from "./drilldown";
import {
  filterContractRiskFindings,
  filterRiskFindingsByScope,
  filterRiskFindingsByView,
  type RiskScopeFilter
} from "./risk-scope";
import { RiskClosureTimeline } from "./risk/RiskClosureTimeline";
import { RiskFindingsListPanel } from "./risk/RiskFindingsListPanel";
import { RiskKpiCards } from "./risk/RiskKpiCards";
import { RiskPageShell } from "./risk/RiskPageShell";
import { RiskResolutionWorkbench } from "./risk/RiskResolutionWorkbench";
import { RiskWorkbenchHeader } from "./risk/RiskWorkbenchHeader";
import { readRiskUrlState, writeRiskUrlState, type RiskViewFilter } from "./risk/risk-url-state";
import { writeAuditUrlState } from "./audit/audit-url-state";

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

export function RiskPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlState = useMemo(() => readRiskUrlState(searchParams), [searchParams]);
  const navState = normalizeDrilldownState(location.state);
  const navEventId = navState.businessEventId ?? null;
  const navRiskFindingId = navState.riskFindingId ?? null;
  const navContractId = navState.contractId ?? null;
  const { t } = useI18n();
  const [findings, setFindings] = useState<RiskFinding[]>([]);
  const [closureRecords, setClosureRecords] = useState<RiskClosureRecord[]>([]);
  const [selectedFindingId, setSelectedFindingId] = useState(urlState.findingId);
  const [eventId, setEventId] = useState(urlState.eventId);
  const [events, setEvents] = useState<BusinessEvent[]>([]);
  const [eventSearch, setEventSearch] = useState("");
  const [showEventDropdown, setShowEventDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [resolution, setResolution] = useState("已复核并完成整改。");
  const [scopeFilter, setScopeFilter] = useState<RiskScopeFilter>(urlState.scope);
  const [viewFilter, setViewFilter] = useState<RiskViewFilter>(urlState.view);
  const [message, setMessage] = useState("正在准备风险勾稽。");
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    async function bootstrap() {
      try {
        const [eventsPayload, findingsPayload] = await Promise.all([listEvents(), listRiskFindings()]);
        setEvents(eventsPayload.items);
        const scopedEvents = navContractId
          ? eventsPayload.items.filter((item) => item.contractId === navContractId)
          : eventsPayload.items;
        const preferredEvent = urlState.eventId
          ? eventsPayload.items.find((item) => item.id === urlState.eventId) ?? null
          : navEventId
            ? eventsPayload.items.find((item) => item.id === navEventId) ?? null
            : null;
        const firstEvent = preferredEvent ?? scopedEvents[0] ?? eventsPayload.items[0] ?? null;
        setEventId(firstEvent?.id ?? "");
        setEventSearch(firstEvent?.title ?? firstEvent?.id ?? "");
        setFindings(findingsPayload.items);

        const scopedFindings = navContractId
          ? filterContractRiskFindings(findingsPayload.items, eventsPayload.items, navContractId)
          : findingsPayload.items;
        const preferredFinding = urlState.findingId
          ? findingsPayload.items.find((item) => item.id === urlState.findingId) ?? null
          : navRiskFindingId
            ? findingsPayload.items.find((item) => item.id === navRiskFindingId) ?? null
            : navEventId
              ? findingsPayload.items.find((item) => item.businessEventId === navEventId) ?? null
              : scopedFindings[0] ?? null;
        setSelectedFindingId(preferredFinding?.id ?? findingsPayload.items[0]?.id ?? "");
        if (preferredFinding?.id) {
          void loadClosureRecords(preferredFinding.id);
        }
        setMessage(
          `${navContractId ? `当前合同 ${navContractId}：` : navEventId ? `当前事项 ${navEventId}：` : navRiskFindingId ? `当前风险 ${navRiskFindingId}：` : ""}已加载 ${findingsPayload.total} 条风险发现。`
        );
      } catch (error) {
        setMessage((error as Error).message);
      }
    }
    void bootstrap();
  }, [navContractId, navEventId, navRiskFindingId, urlState.eventId, urlState.findingId]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowEventDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    const next = writeRiskUrlState({
      scope: scopeFilter,
      eventId,
      findingId: selectedFindingId,
      view: viewFilter
    });
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [eventId, scopeFilter, searchParams, selectedFindingId, setSearchParams, viewFilter]);

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

  const visibleEvents = useMemo(
    () => (navContractId ? events.filter((event) => event.contractId === navContractId) : events),
    [events, navContractId]
  );

  const eventMap = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);

  const visibleFindings = useMemo(() => {
    const scopedByContract = navContractId ? filterContractRiskFindings(findings, events, navContractId) : findings;
    const scopedByContext = navEventId
      ? scopedByContract.filter((finding) => finding.businessEventId === navEventId)
      : navRiskFindingId
        ? scopedByContract.filter((finding) => finding.id === navRiskFindingId)
        : scopedByContract;
    const scopedByObject = filterRiskFindingsByScope(scopedByContext, eventMap, scopeFilter);
    return filterRiskFindingsByView(scopedByObject, viewFilter);
  }, [eventMap, events, findings, navContractId, navEventId, navRiskFindingId, scopeFilter, viewFilter]);

  const selectedFinding = useMemo(
    () => findings.find((item) => item.id === selectedFindingId) ?? visibleFindings[0] ?? null,
    [findings, selectedFindingId, visibleFindings]
  );
  const selectedFindingEvent = useMemo(
    () => selectedFinding?.businessEventId ? eventMap.get(selectedFinding.businessEventId) ?? null : null,
    [eventMap, selectedFinding]
  );
  const closureTargets = useMemo(
    () => selectedFinding ? buildRiskClosureTargetChain({ findingId: selectedFinding.id, event: selectedFindingEvent }) : [],
    [selectedFinding, selectedFindingEvent]
  );

  function navigateWithState(path: string, state?: Record<string, string>) {
    navigate(path, { state });
  }

  function openAuditForSelectedFinding() {
    if (!selectedFinding) {
      return;
    }
    const auditSearch = writeAuditUrlState({
      resourceType: "risk_finding",
      resourceId: selectedFinding.id,
      from: "",
      to: "",
      offset: 0,
      logId: "",
      expandedId: ""
    });
    navigate(
      { pathname: "/audit", search: `?${auditSearch.toString()}` },
      {
        state: {
          resourceType: "risk_finding",
          resourceId: selectedFinding.id,
          riskFindingId: selectedFinding.id,
          ...(selectedFinding.businessEventId ? { businessEventId: selectedFinding.businessEventId } : {})
        }
      }
    );
  }

  async function closeSelectedFinding() {
    if (!selectedFinding) {
      return;
    }
    await closeRiskFinding(selectedFinding.id, resolution);
    await Promise.all([refreshFindings(), loadClosureRecords(selectedFinding.id)]);
  }

  return (
    <section style={{ display: "grid", gap: "20px" }}>
      {showHelp ? <RiskHelpModal onClose={() => setShowHelp(false)} /> : null}
      <RiskPageShell
        header={
          <Fragment>
            <RiskWorkbenchHeader
              message={message}
              navState={navState}
              scopeFilter={scopeFilter}
              viewFilter={viewFilter}
              eventId={eventId}
              eventSearch={eventSearch}
              visibleEvents={visibleEvents}
              selectedFinding={selectedFinding}
              resolution={resolution}
              showEventDropdown={showEventDropdown}
              dropdownRef={dropdownRef}
              onShowHelp={() => setShowHelp(true)}
              onEventSearchChange={(value) => {
                setEventSearch(value);
                setShowEventDropdown(true);
              }}
              onFocusEventSearch={() => setShowEventDropdown(true)}
              onSelectEvent={(nextEventId, title) => {
                setEventId(nextEventId);
                setEventSearch(title);
                setShowEventDropdown(false);
              }}
              onResolutionChange={setResolution}
              onScopeChange={setScopeFilter}
              onViewChange={setViewFilter}
              onRunRiskCheck={() =>
                void runEventRiskCheck(eventId)
                  .then(() => refreshFindings())
                  .catch((error) => setMessage((error as Error).message))
              }
            />
            <ProcessFlowStageSection
              title="风险检查流程回看"
              subtitle="风险检查主要来源于 AI 初判与资料校验阶段，并会联动事项、凭证和税务处理结果。当前页可从两类业务主线回看风险来源并跳转到相关业务页面。"
              currentNodeId="ai_precheck"
              branch={null}
              businessEventId={eventId || undefined}
            />
          </Fragment>
        }
        kpiCards={<RiskKpiCards findings={findings} />}
        list={
          <RiskFindingsListPanel
            findings={visibleFindings}
            eventMap={eventMap}
            navEventId={navEventId}
            selectedFindingId={selectedFinding?.id ?? ""}
            severityLabel={(severity) => t(RISK_SEVERITY_LABELS, severity)}
            priorityLabel={(priority) => t(RISK_PRIORITY_LABELS, priority)}
            statusLabel={(status) => t(RISK_STATUS_LABELS, status)}
            onSelectFinding={(findingId) =>
              void loadClosureRecords(findingId).catch((error) => setMessage((error as Error).message))
            }
            onNavigate={navigateWithState}
          />
        }
        detail={
          <RiskResolutionWorkbench
            finding={selectedFinding}
            event={selectedFindingEvent}
            closureTargets={closureTargets}
            resolution={resolution}
            onResolutionChange={setResolution}
            onNavigate={navigateWithState}
            onOpenAudit={openAuditForSelectedFinding}
            onCloseFinding={() =>
              void closeSelectedFinding().catch((error) => setMessage((error as Error).message))
            }
          />
        }
        timeline={<RiskClosureTimeline selectedFindingId={selectedFinding?.id ?? ""} records={closureRecords} />}
      />
    </section>
  );
}
