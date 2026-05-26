import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Contract, ContractWithEventCount, GeneratedDocument, Task, TaxItem, Voucher } from "@finance-taxation/domain-model";
import {
  analyzeEvent,
  closeContract,
  createEvent,
  createContract,
  getContractDetail,
  listEvents,
  listContracts
} from "../lib/api";
import { useI18n, EVENT_STATUS_LABELS } from "../lib/i18n";
import {
  type ContractFollowupAction,
  buildContractEventInput,
  buildContractFollowupEventInput,
  buildContractTerminalEventInput,
  getContractFollowupActions
} from "./contract-event";
import { buildContractAutoDerivationPlan } from "./contract-automation";
import { buildContractNavigationState, resolveContractAuditContext } from "./contract-drilldown";
import { normalizeDrilldownState } from "./drilldown";
import { buildContractTimeline } from "./contract-timeline";
import { buildContractWorkflow } from "./contract-workflow";
import { ContractsShell } from "./contracts/ContractsShell";
import { ContractsHeader } from "./contracts/ContractsHeader";
import { ContractsFiltersBar } from "./contracts/ContractsFiltersBar";
import { ContractsListPanel } from "./contracts/ContractsListPanel";
import { ContractsWorkbench } from "./contracts/ContractsWorkbench";
import { ContractFollowupActions, ContractWorkflowSummary } from "./contracts/ContractWorkflowSummary";
import { ContractObjectOverview, ContractWorkbenchActions } from "./contracts/ContractObjectOverview";
import { ContractRelatedEventsTable } from "./contracts/ContractRelatedEventsTable";

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  sales: "销售合同",
  procurement: "采购合同",
  lease: "租赁合同",
  service: "服务合同",
  other: "其他"
};

const STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  active: "执行中",
  fulfilled: "已履行",
  terminated: "已终止",
  expired: "已到期"
};

const STATUS_COLOR: Record<string, string> = {
  draft: "#8a9bb0",
  active: "#1a7f5a",
  fulfilled: "#4a7fc4",
  terminated: "#c0392b",
  expired: "#b0890a"
};

const FOLLOWUP_ACTION_LABELS: Record<ContractFollowupAction, string> = {
  invoice: "开票",
  collection: "回款/付款",
  revenue: "收入确认",
  procurement_execution: "采购执行",
  payment_arrangement: "付款安排",
  acceptance: "验收归档",
  lease_payment: "租赁付款",
  lease_accrual: "费用确认"
};

const WORKFLOW_STATE_LABELS = {
  done: "已完成",
  in_progress: "处理中",
  blocked: "已阻塞",
  pending: "待推进"
} as const;

const WORKFLOW_STATE_STYLES = {
  done: { border: "rgba(26,127,90,0.16)", bg: "rgba(26,127,90,0.06)", tagBg: "rgba(26,127,90,0.12)", color: "#1a7f5a" },
  in_progress: { border: "rgba(37,99,235,0.16)", bg: "rgba(37,99,235,0.06)", tagBg: "rgba(37,99,235,0.12)", color: "#2563eb" },
  blocked: { border: "rgba(192,57,43,0.16)", bg: "rgba(192,57,43,0.06)", tagBg: "rgba(192,57,43,0.12)", color: "#c0392b" },
  pending: { border: "rgba(176,137,10,0.16)", bg: "rgba(255,186,8,0.08)", tagBg: "rgba(176,137,10,0.12)", color: "#b0890a" }
} as const;

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

interface ContractDetailView {
  contract: Contract;
  relatedEvents: { id: string; title: string; status: string; createdAt: string }[];
  relatedTasks: Task[];
  relatedDocuments: GeneratedDocument[];
  relatedTaxItems: TaxItem[];
  relatedVouchers: Voucher[];
}

type RelatedEventView = ContractDetailView["relatedEvents"][number];

export function ContractsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const navContractId = normalizeDrilldownState(location.state).contractId ?? null;
  const { t } = useI18n();
  const [contracts, setContracts] = useState<ContractWithEventCount[]>([]);
  const [detail, setDetail] = useState<ContractDetailView | null>(null);
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("正在加载合同数据...");
  const [creatingEventContractId, setCreatingEventContractId] = useState<string | null>(null);

  const [form, setForm] = useState({
    contractType: "sales",
    title: "",
    counterpartyName: "",
    counterpartyType: "external",
    amount: "",
    currency: "CNY",
    signedDate: "",
    startDate: "",
    endDate: "",
    notes: ""
  });
  const firstRelatedEvent = detail?.relatedEvents[0] ?? null;
  const timeline = detail
    ? buildContractTimeline({
        contract: detail.contract,
        relatedEvents: detail.relatedEvents
      })
    : [];
  const autoDerivationPlan = detail
    ? buildContractAutoDerivationPlan({
        contract: detail.contract,
        relatedEvents: detail.relatedEvents
      })
    : null;
  const workflow = detail
    ? buildContractWorkflow({
        contract: detail.contract,
        relatedEvents: detail.relatedEvents
      })
    : null;

  useEffect(() => {
    async function bootstrap() {
      try {
        await loadContracts();
      } catch {
        setMessage("加载失败，请检查后端连接。");
      }
    }
    bootstrap();
  }, []);

  useEffect(() => {
    if (!navContractId) {
      return;
    }
    void handleDetail(navContractId).catch((error) => setMessage((error as Error).message));
  }, [navContractId]);

  async function loadContracts() {
    const filters = {
      contractType: filterType || undefined,
      status: filterStatus || undefined
    };
    const res = await listContracts(filters);
    setContracts(res.items);
    setMessage(`已加载 ${res.total} 条合同。`);
  }

  async function handleCreate() {
    if (!form.title || !form.counterpartyName) {
      setMessage("合同标题和交易方名称不能为空。");
      return;
    }
    await createContract({
      contractType: form.contractType,
      title: form.title,
      counterpartyName: form.counterpartyName,
      counterpartyType: form.counterpartyType,
      amount: Number(form.amount) || 0,
      currency: form.currency,
      signedDate: form.signedDate || undefined,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      notes: form.notes
    });
    setShowForm(false);
    setForm({
      contractType: "sales", title: "", counterpartyName: "",
      counterpartyType: "external", amount: "", currency: "CNY",
      signedDate: "", startDate: "", endDate: "", notes: ""
    });
    await loadContracts();
    setMessage("合同已创建。");
  }

  async function handleClose(contract: Contract, status: "fulfilled" | "terminated") {
    await closeContract(contract.id, status);
    const terminalInput = buildContractTerminalEventInput(contract, status, new Date().toISOString().slice(0, 10));
    const existingEvents = await listEvents();
    const existing = existingEvents.items.find((event) => event.title === terminalInput.title);
    const created = existing ?? await createEvent(terminalInput);
    if (!existing) {
      await analyzeEvent(created.id);
    }
    await loadContracts();
    if (detail?.contract.id === contract.id) {
      await handleDetail(contract.id);
    }
    setMessage(`合同已标记为${STATUS_LABELS[status]}。`);
  }

  async function handleDetail(contractId: string) {
    const res = await getContractDetail(contractId);
    setDetail(res);
  }

  async function handleCreateEvent(contract: Contract) {
    setCreatingEventContractId(contract.id);
    try {
      const input = buildContractEventInput(contract);
      const existingEvents = await listEvents();
      const existing = existingEvents.items.find((event) => event.title === input.title);
      const created = existing ?? await createEvent(input);
      if (!existing) {
        await analyzeEvent(created.id);
      }
      const latestEvents = await listEvents();
      const autoCreated = await autoDeriveContractFollowups(
        contract,
        latestEvents.items
          .filter((event) => event.contractId === contract.id)
          .map((event) => ({
            id: event.id,
            title: event.title,
            status: event.status,
            createdAt: event.createdAt ?? ""
          }))
      );
      await loadContracts();
      await handleDetail(contract.id);
      setMessage(
        existing
          ? `已存在同名合同事项：${created.title}，直接复用${autoCreated > 0 ? `，并自动补齐 ${autoCreated} 个履约事项` : ""}。`
          : `已为合同生成并分析经营事项：${created.title}${autoCreated > 0 ? `，并自动补齐 ${autoCreated} 个履约事项` : ""}。`
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setCreatingEventContractId(null);
    }
  }

  async function handleCreateFollowupEvent(contract: Contract, action: ContractFollowupAction) {
    setCreatingEventContractId(contract.id);
    try {
      const input = buildContractFollowupEventInput(contract, action);
      const existingEvent = detail?.relatedEvents.find((event) => event.title === input.title);
      const targetEvent = existingEvent ?? await createEvent(input);
      if (!existingEvent) {
        await analyzeEvent(targetEvent.id);
      }
      await handleDetail(contract.id);
      await loadContracts();
      setMessage(
        existingEvent
          ? `已存在同名履约事项：${targetEvent.title}，直接复用。`
          : `已创建并分析合同履约事项：${targetEvent.title}。`
      );
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setCreatingEventContractId(null);
    }
  }

  async function autoDeriveContractFollowups(contract: Contract, relatedEvents: RelatedEventView[]) {
    const plan = buildContractAutoDerivationPlan({ contract, relatedEvents });
    if (plan.autoCreateActions.length === 0) {
      return 0;
    }

    let createdCount = 0;
    const knownTitles = new Set(relatedEvents.map((event) => event.title));

    for (const action of plan.autoCreateActions) {
      const input = buildContractFollowupEventInput(contract, action);
      if (knownTitles.has(input.title)) {
        continue;
      }
      const created = await createEvent(input);
      await analyzeEvent(created.id);
      knownTitles.add(input.title);
      createdCount += 1;
    }

    return createdCount;
  }

  async function handleAutoDeriveFollowups(contract: Contract) {
    setCreatingEventContractId(contract.id);
    try {
      const count = await autoDeriveContractFollowups(contract, detail?.relatedEvents ?? []);
      await handleDetail(contract.id);
      await loadContracts();
      setMessage(count > 0 ? `已按规则自动补齐 ${count} 个履约事项。` : "当前合同没有可自动补齐的履约事项。");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setCreatingEventContractId(null);
    }
  }

  function navigateWithEvent(path: string, eventId: string) {
    const contractId = detail?.contract.id;
    navigate(path, {
      state: contractId
        ? buildContractNavigationState(contractId, { businessEventId: eventId })
        : { businessEventId: eventId }
    });
  }

  const header = <ContractsHeader message={message} onToggleCreate={() => setShowForm((value) => !value)} />;

  const createForm = showForm ? (
    <div style={panelStyle()}>
      <h3 style={{ margin: "0 0 16px", fontSize: "16px" }}>新建合同</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        {[
          { label: "合同类型", key: "contractType", type: "select", options: Object.entries(CONTRACT_TYPE_LABELS) },
          { label: "合同标题*", key: "title", type: "text" },
          { label: "交易方名称*", key: "counterpartyName", type: "text" },
          { label: "交易方类型", key: "counterpartyType", type: "select", options: [["external", "外部"], ["internal", "内部"]] },
          { label: "合同金额", key: "amount", type: "number" },
          { label: "币种", key: "currency", type: "text" },
          { label: "签订日期", key: "signedDate", type: "date" },
          { label: "起始日期", key: "startDate", type: "date" },
          { label: "到期日期", key: "endDate", type: "date" }
        ].map(({ label, key, type, options }) => (
          <label key={key} style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px" }}>
            <span style={{ color: "#6c7a89" }}>{label}</span>
            {type === "select" ? (
              <select
                value={form[key as keyof typeof form]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                style={{ padding: "8px", borderRadius: "6px", border: "1px solid #dce3ea", fontSize: "13px" }}
              >
                {options?.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ) : (
              <input
                type={type}
                value={form[key as keyof typeof form]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                style={{ padding: "8px", borderRadius: "6px", border: "1px solid #dce3ea", fontSize: "13px" }}
              />
            )}
          </label>
        ))}
        <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", gridColumn: "1 / -1" }}>
          <span style={{ color: "#6c7a89" }}>备注</span>
          <textarea
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            style={{ padding: "8px", borderRadius: "6px", border: "1px solid #dce3ea", fontSize: "13px", resize: "vertical" }}
          />
        </label>
      </div>
      <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
        <button
          onClick={handleCreate}
          style={{ background: "#1e2a37", color: "#fff", border: "none", borderRadius: "6px", padding: "8px 20px", cursor: "pointer" }}
        >
          确认创建
        </button>
        <button
          onClick={() => setShowForm(false)}
          style={{ background: "#eef0f3", color: "#1e2a37", border: "none", borderRadius: "6px", padding: "8px 16px", cursor: "pointer" }}
        >
          取消
        </button>
      </div>
    </div>
  ) : null;

  const filters = (
    <ContractsFiltersBar
      filterType={filterType}
      filterStatus={filterStatus}
      typeOptions={Object.entries(CONTRACT_TYPE_LABELS)}
      statusOptions={Object.entries(STATUS_LABELS)}
      onTypeChange={setFilterType}
      onStatusChange={setFilterStatus}
      onApply={() => void loadContracts()}
    />
  );

  const list = (
    <ContractsListPanel>
      <div style={panelStyle()}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ color: "#6c7a89" }}>
              {["合同标题", "类型", "交易方", "金额", "状态", "关联事项", "操作"].map((h) => (
                <th key={h} style={{ ...cellStyle(), fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {contracts.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ ...cellStyle(), color: "#aab5c0", textAlign: "center", padding: "32px" }}>
                  暂无合同数据，请点击"新建合同"添加
                </td>
              </tr>
            ) : (
              contracts.map((c) => (
                <tr key={c.id}>
                  <td style={cellStyle()}>
                    <button
                      onClick={() => handleDetail(c.id)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#2563eb", fontSize: "13px", padding: 0 }}
                    >
                      {c.title}
                    </button>
                    <div style={{ color: "#8a9bb0", fontSize: "11px" }}>{c.contractNo}</div>
                  </td>
                  <td style={cellStyle()}>{CONTRACT_TYPE_LABELS[c.contractType] ?? c.contractType}</td>
                  <td style={cellStyle()}>{c.counterpartyName}</td>
                  <td style={cellStyle()}>
                    {c.amount.toLocaleString("zh-CN", { style: "currency", currency: c.currency || "CNY" })}
                  </td>
                  <td style={cellStyle()}>
                    <span style={{
                      background: `${STATUS_COLOR[c.status]}22`,
                      color: STATUS_COLOR[c.status],
                      borderRadius: "999px", padding: "2px 10px", fontSize: "12px"
                    }}>
                      {STATUS_LABELS[c.status] ?? c.status}
                    </span>
                  </td>
                  <td style={{ ...cellStyle(), textAlign: "center" as const }}>{c.relatedEventCount}</td>
                  <td style={cellStyle()}>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      <button
                        onClick={() => handleCreateEvent(c)}
                        disabled={creatingEventContractId === c.id}
                        style={{ fontSize: "12px", padding: "3px 10px", borderRadius: "6px", border: "1px solid #2563eb", color: "#2563eb", background: "none", cursor: "pointer", opacity: creatingEventContractId === c.id ? 0.6 : 1 }}
                      >
                        {creatingEventContractId === c.id ? "生成中..." : "新增事项"}
                      </button>
                      {c.status === "active" && (
                        <>
                        <button
                          onClick={() => handleClose(c, "fulfilled")}
                          style={{ fontSize: "12px", padding: "3px 10px", borderRadius: "6px", border: "1px solid #1a7f5a", color: "#1a7f5a", background: "none", cursor: "pointer" }}
                        >
                          已履行
                        </button>
                        <button
                          onClick={() => handleClose(c, "terminated")}
                          style={{ fontSize: "12px", padding: "3px 10px", borderRadius: "6px", border: "1px solid #c0392b", color: "#c0392b", background: "none", cursor: "pointer" }}
                        >
                          终止
                        </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </ContractsListPanel>
  );

  const detailView = detail ? (
    <ContractsWorkbench>
      <div style={panelStyle()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: "16px" }}>{detail.contract.title}</h3>
          <button
            onClick={() => setDetail(null)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#6c7a89", fontSize: "18px" }}
          >
            ×
          </button>
        </div>
        <ContractWorkflowSummary
          contractStatusLabel={STATUS_LABELS[detail.contract.status] ?? detail.contract.status}
          summary={workflow?.summary ?? "当前合同已进入履约工作台，可继续推进事项、税务和凭证处理。"}
          recommendedActionsLabel={workflow?.recommendedActions.length ? workflow.recommendedActions.map((action) => FOLLOWUP_ACTION_LABELS[action]).join(" / ") : undefined}
          autoCreateCount={autoDerivationPlan?.autoCreateActions.length ?? 0}
        />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px 24px", fontSize: "13px", marginBottom: "20px" }}>
          {[
            ["合同编号", detail.contract.contractNo],
            ["类型", CONTRACT_TYPE_LABELS[detail.contract.contractType]],
            ["状态", STATUS_LABELS[detail.contract.status]],
            ["交易方", detail.contract.counterpartyName],
            ["金额", `${detail.contract.amount.toLocaleString()} ${detail.contract.currency}`],
            ["签订日期", detail.contract.signedDate ?? "—"],
            ["起始日期", detail.contract.startDate ?? "—"],
            ["到期日期", detail.contract.endDate ?? "—"],
            ["备注", detail.contract.notes || "—"]
          ].map(([k, v]) => (
            <div key={k}>
              <div style={{ color: "#6c7a89", marginBottom: "2px" }}>{k}</div>
              <div>{v}</div>
            </div>
          ))}
        </div>
        <ContractFollowupActions
          creating={creatingEventContractId === detail.contract.id}
          workflow={workflow}
          availableActions={getContractFollowupActions(detail.contract)}
          autoCreateActionsCount={autoDerivationPlan?.autoCreateActions.length ?? 0}
          actionLabels={FOLLOWUP_ACTION_LABELS}
          stateLabels={WORKFLOW_STATE_LABELS}
          stateStyles={WORKFLOW_STATE_STYLES}
          onCreateAction={(action) => void handleCreateFollowupEvent(detail.contract, action as ContractFollowupAction)}
          onAutoCreate={() => void handleAutoDeriveFollowups(detail.contract)}
          onOpenEvent={(eventId) => navigateWithEvent("/events", eventId)}
        />
          {timeline.length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <div style={{ color: "#6c7a89", fontSize: "12px", marginBottom: "8px" }}>合同履约时间轴</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {timeline.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "96px 1fr auto",
                      gap: "12px",
                      alignItems: "center",
                      padding: "8px 12px",
                      borderRadius: "10px",
                      background: item.kind === "contract" ? "rgba(37,99,235,0.06)" : "rgba(20,40,60,0.04)",
                      border: "1px solid rgba(20,40,60,0.08)"
                    }}
                  >
                    <div style={{ fontSize: "12px", color: "#6c7a89" }}>{item.date}</div>
                    <div style={{ fontSize: "13px", color: "#1e2a37" }}>{item.title}</div>
                    {item.relatedEventId ? (
                      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        <span
                          style={{
                            fontSize: "11px",
                            color: WORKFLOW_STATE_STYLES[item.status].color,
                            background: WORKFLOW_STATE_STYLES[item.status].tagBg,
                            padding: "4px 10px",
                            borderRadius: "999px"
                          }}
                        >
                          {WORKFLOW_STATE_LABELS[item.status]}
                        </span>
                        <button
                          onClick={() => navigateWithEvent("/events", item.relatedEventId!)}
                          style={{ fontSize: "11px", padding: "4px 10px", borderRadius: "999px", border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer" }}
                        >
                          查看事项
                        </button>
                      </div>
                    ) : (
                      <span
                        style={{
                          fontSize: "11px",
                          color: WORKFLOW_STATE_STYLES[item.status].color,
                          background: WORKFLOW_STATE_STYLES[item.status].tagBg,
                          padding: "4px 10px",
                          borderRadius: "999px"
                        }}
                      >
                        {WORKFLOW_STATE_LABELS[item.status]}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        <ContractObjectOverview
          relatedTasksCount={detail.relatedTasks.length}
          relatedDocumentsCount={detail.relatedDocuments.length}
          relatedTaxItemsCount={detail.relatedTaxItems.length}
          relatedVouchersCount={detail.relatedVouchers.length}
        />
        <ContractWorkbenchActions
          creating={creatingEventContractId === detail.contract.id}
          createActionLabel={creatingEventContractId === detail.contract.id ? "生成事项中..." : "新增关联事项"}
          hasEvent={Boolean(firstRelatedEvent)}
          hasTask={Boolean(detail.relatedTasks[0])}
          hasTax={Boolean(detail.relatedTaxItems[0])}
          hasVoucher={Boolean(detail.relatedVouchers[0])}
          onCreateRelatedEvent={() => void handleCreateEvent(detail.contract)}
          onOpenEvents={() => firstRelatedEvent ? navigateWithEvent("/events", firstRelatedEvent.id) : undefined}
          onOpenTasks={() => detail.relatedTasks[0]?.businessEventId ? navigateWithEvent("/tasks", detail.relatedTasks[0].businessEventId) : undefined}
          onOpenTax={() => detail.relatedTaxItems[0]?.businessEventId ? navigateWithEvent("/tax", detail.relatedTaxItems[0].businessEventId) : undefined}
          onOpenVouchers={() => detail.relatedVouchers[0]?.businessEventId ? navigateWithEvent("/vouchers", detail.relatedVouchers[0].businessEventId) : undefined}
          onOpenRisk={() => navigate("/risk", { state: buildContractNavigationState(detail.contract.id) })}
          onOpenAudit={() => navigate("/audit", { state: { ...resolveContractAuditContext(detail.contract.id), ...buildContractNavigationState(detail.contract.id) } })}
        />
        <ContractRelatedEventsTable
          title="关联经营事项"
          events={detail.relatedEvents}
          statusLabel={(status) => t(EVENT_STATUS_LABELS, status)}
          onOpenEvent={(eventId) => navigateWithEvent("/events", eventId)}
          onOpenTasks={(eventId) => navigateWithEvent("/tasks", eventId)}
          onOpenTax={(eventId) => navigateWithEvent("/tax", eventId)}
          onOpenVouchers={(eventId) => navigateWithEvent("/vouchers", eventId)}
        />
      </div>
    </ContractsWorkbench>
  ) : null;

  return (
    <ContractsShell
      header={header}
      createForm={createForm}
      filters={filters}
      list={list}
      detail={detailView}
    />
  );
}
