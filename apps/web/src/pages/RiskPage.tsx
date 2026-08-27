import { useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "antd";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { BusinessEvent, RiskClosureRecord, RiskFinding } from "@finance-taxation/domain-model";
import {
  closeRiskFinding,
  listEvents,
  listRiskClosureRecords,
  listRiskFindings,
  runEventRiskCheck
} from "../lib/api";
import { TaskFocusShell } from "../components/ui/TaskFocusShell";
import { resolveActiveTask } from "../lib/task-focus";
import { LevelLegend, RISK_SEVERITY_LEVELS } from "../components/ui/LevelLegend";
import { ProPageBanner } from "../components/ui/ProPageBanner";
import { Term } from "../components/ui/Term";
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
import { RiskFindingsToolbar } from "./risk/RiskFindingsToolbar";
import { RiskFindingsWorkspace } from "./risk/RiskFindingsWorkspace";
import { RiskKpiCards } from "./risk/RiskKpiCards";
import { RiskPageShell } from "./risk/RiskPageShell";
import { RiskResolutionWorkbench } from "./risk/RiskResolutionWorkbench";
import { RiskWorkbenchHeader } from "./risk/RiskWorkbenchHeader";
import { AnomalyScanPanel } from "./risk/AnomalyScanPanel";
import { TaxConsistencyPanel } from "./risk/TaxConsistencyPanel";
import { buildRiskFindingFlow } from "./risk/risk-finding-flow";
import { buildRiskTasks, countOpenFindings, RISK_TASK_KEYS } from "./risk/risk-tasks";
import { readRiskUrlState, writeRiskUrlState, type RiskViewFilter } from "./risk/risk-url-state";
import { writeAuditUrlState } from "./audit/audit-url-state";

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
  /**
   * 加载失败的原因。
   *
   * **与「没有风险」严格区分**：接口 403 时，KPI 卡片会照常渲染
   * 「0 条 · 全部已关闭 · 关闭率 0%」——那看起来是一份健康的看板，
   * 而实际上是这个账号根本读不到数据。税务专员在实验里就这样被误导过：
   * 同一账号从归档包接口能读到「未关闭 7 项」。
   *
   * 给人看「一切正常」比给人看报错危险得多。
   */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [taskKey, setTaskKey] = useState(urlState.task);

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
        const raw = (error as Error).message;
        // 403 说人话：用户要知道这是权限问题，而不是「系统坏了」或「没有风险」。
        setLoadError(
          /forbidden|403/i.test(raw)
            ? "当前账号没有查看风险发现的权限（risk.view）。请联系管理员开通，或换一个有权限的账号。"
            : raw
        );
        setMessage("风险数据加载失败。");
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
      view: viewFilter,
      task: taskKey
    });
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [eventId, scopeFilter, searchParams, selectedFindingId, setSearchParams, taskKey, viewFilter]);

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
  const findingFlow = useMemo(
    () => buildRiskFindingFlow({ finding: selectedFinding, closureRecords }),
    [closureRecords, selectedFinding]
  );

  // 三件事的角标只认真实待办数：处置任务用「还没关闭的风险」条数。
  const tasks = useMemo(() => buildRiskTasks(countOpenFindings(findings)), [findings]);
  const activeTaskKey = resolveActiveTask(tasks, taskKey, RISK_TASK_KEYS.findings);

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

  const findingsToolbar = (
    <RiskFindingsToolbar
      scopeFilter={scopeFilter}
      viewFilter={viewFilter}
      eventId={eventId}
      eventSearch={eventSearch}
      visibleEvents={visibleEvents}
      showEventDropdown={showEventDropdown}
      dropdownRef={dropdownRef}
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
      onScopeChange={setScopeFilter}
      onViewChange={setViewFilter}
      onRunRiskCheck={() =>
        void runEventRiskCheck(eventId)
          .then(() => refreshFindings())
          .catch((error) => setMessage((error as Error).message))
      }
    />
  );

  const findingsWorkspace = (
    <RiskFindingsWorkspace
      kpiCards={
        loadError ? (
          <Alert
            type="error"
            showIcon
            message="风险数据没有加载出来"
            description={
              <span>
                {loadError}
                <br />
                <strong>下面不是「没有风险」，而是读不到数据</strong>——请不要按当前画面判断风险状况。
              </span>
            }
          />
        ) : (
          <RiskKpiCards findings={findings} />
        )
      }
      list={
        <RiskFindingsListPanel
          toolbar={findingsToolbar}
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
          flow={findingFlow}
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
  );

  const RISK_TASK_PANELS: Record<string, JSX.Element> = {
    [RISK_TASK_KEYS.findings]: findingsWorkspace,
    [RISK_TASK_KEYS.consistency]: <TaxConsistencyPanel />,
    [RISK_TASK_KEYS.anomaly]: <AnomalyScanPanel />
  };

  return (
    <section style={{ display: "grid", gap: "20px" }}>
      <RiskPageShell
        header={
          <>
            <ProPageBanner
              pageName="风险中心"
              plain="系统自动扫出来的账务、税务疑点清单，以及每条疑点的核实和处理记录，财务会逐条销掉。您只需要留意有没有高等级风险一直没人处理。"
            />
            <RiskWorkbenchHeader message={message} navState={navState} />
          </>
        }
      >
        <TaskFocusShell
          tasks={tasks}
          activeKey={activeTaskKey}
          onSelectTask={setTaskKey}
          switcherLabel="风险中心当前要做的事"
        >
          {activeTaskKey ? RISK_TASK_PANELS[activeTaskKey] ?? null : null}
        </TaskFocusShell>
      </RiskPageShell>
    </section>
  );
}
