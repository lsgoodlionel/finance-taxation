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
import { ContractMetadataGrid } from "./contracts/ContractMetadataGrid";
import { ContractTimelinePanel } from "./contracts/ContractTimelinePanel";
import { ContractCreateForm } from "./contracts/ContractCreateForm";
import { ContractsTable } from "./contracts/ContractsTable";
import { EmptyState } from "../components/ui/EmptyState";

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
      <ContractCreateForm
        value={form}
        contractTypeOptions={Object.entries(CONTRACT_TYPE_LABELS)}
        counterpartyTypeOptions={[["external", "外部"], ["internal", "内部"]]}
        onChange={setForm}
        onSubmit={() => void handleCreate()}
        onCancel={() => setShowForm(false)}
      />
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
        {contracts.length === 0 ? (
          <EmptyState
            title="当前没有匹配的合同"
            description="你可以先新建合同，或调整筛选条件后重新查看。"
            action={(
              <button
                onClick={() => setShowForm(true)}
                style={{ background: "#1e2a37", color: "#fff", border: "none", borderRadius: "8px", padding: "10px 20px", cursor: "pointer", fontSize: "14px" }}
              >
                + 新建合同
              </button>
            )}
          />
        ) : (
          <ContractsTable
            contracts={contracts}
            creatingEventContractId={creatingEventContractId}
            contractTypeLabels={CONTRACT_TYPE_LABELS}
            statusLabels={STATUS_LABELS}
            statusColor={STATUS_COLOR}
            onOpenDetail={(contractId) => void handleDetail(contractId)}
            onCreateEvent={(contract) => void handleCreateEvent(contract)}
            onClose={(contract, status) => void handleClose(contract, status)}
          />
        )}
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
        <ContractMetadataGrid
          fields={[
            { label: "合同编号", value: detail.contract.contractNo ?? "—" },
            { label: "类型", value: CONTRACT_TYPE_LABELS[detail.contract.contractType] ?? detail.contract.contractType },
            { label: "状态", value: STATUS_LABELS[detail.contract.status] ?? detail.contract.status },
            { label: "交易方", value: detail.contract.counterpartyName },
            { label: "金额", value: `${detail.contract.amount.toLocaleString()} ${detail.contract.currency}` },
            { label: "签订日期", value: detail.contract.signedDate ?? "—" },
            { label: "起始日期", value: detail.contract.startDate ?? "—" },
            { label: "到期日期", value: detail.contract.endDate ?? "—" },
            { label: "备注", value: detail.contract.notes || "—" }
          ]}
        />
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
        <ContractTimelinePanel
          items={timeline}
          stateLabels={WORKFLOW_STATE_LABELS}
          stateStyles={WORKFLOW_STATE_STYLES}
          onOpenEvent={(eventId) => navigateWithEvent("/events", eventId)}
        />
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
  ) : (
    <ContractsWorkbench>
      <div style={panelStyle()}>
        <EmptyState
          title="选择一份合同查看工作台"
          description="右侧会优先显示履约流程摘要、下一步动作、关联事项以及税务/凭证联动结果。"
        />
      </div>
    </ContractsWorkbench>
  );

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
