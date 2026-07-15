import { useEffect, useState } from "react";
import { Segmented } from "antd";
import { AppstoreOutlined, UnorderedListOutlined } from "@ant-design/icons";
import { useLocation, useNavigate } from "react-router-dom";
import type { ContractWithEventCount } from "@finance-taxation/domain-model";
import { describePageLoadError, getContractDetail, listContracts } from "../lib/api";
import { buildContractNavigationState, resolveContractAuditContext } from "./contract-drilldown";
import { normalizeDrilldownState } from "./drilldown";
import { ContractKanbanView } from "./contracts/ContractKanbanView";
import { ContractsShell } from "./contracts/ContractsShell";
import { ContractsHeader } from "./contracts/ContractsHeader";
import { ContractsFiltersBar } from "./contracts/ContractsFiltersBar";
import { ContractsListPanel } from "./contracts/ContractsListPanel";
import { ContractWorkbenchPanel } from "./contracts/ContractWorkbenchPanel";
import { ContractCreateForm } from "./contracts/ContractCreateForm";
import { ContractsTable } from "./contracts/ContractsTable";
import { ContractDrawer } from "./contracts/ContractDrawer";
import { ContractCloseWizard } from "./contracts/ContractCloseWizard";
import { useContractActions } from "./contracts/useContractActions";
import {
  CONTRACT_TYPE_LABELS,
  STATUS_LABELS,
  STATUS_COLOR,
  panelStyle,
  type ContractDetailView
} from "./contracts/contracts-page-meta";
import { EmptyState } from "../components/ui/EmptyState";

export function ContractsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const navContractId = normalizeDrilldownState(location.state).contractId ?? null;
  const [contracts, setContracts] = useState<ContractWithEventCount[]>([]);
  const [detail, setDetail] = useState<ContractDetailView | null>(null);
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("正在加载合同数据...");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [closeWizardOpen, setCloseWizardOpen] = useState(false);
  const [closeStatus, setCloseStatus] = useState<"fulfilled" | "terminated">("fulfilled");
  const [contractView, setContractView] = useState<"list" | "kanban">("list");

  const {
    form,
    setForm,
    creatingEventContractId,
    handleCreate,
    handleClose,
    handleCreateEvent,
    handleCreateFollowupEvent,
    handleAutoDeriveFollowups
  } = useContractActions({
    detail,
    loadContracts,
    handleDetail,
    setMessage,
    closeCreateForm: () => setShowForm(false)
  });

  useEffect(() => {
    async function bootstrap() {
      try {
        await loadContracts();
      } catch (error) {
        setMessage(describePageLoadError(error));
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

  async function handleDetail(contractId: string) {
    const res = await getContractDetail(contractId);
    setDetail(res);
  }

  function navigateWithEvent(path: string, eventId: string) {
    const contractId = detail?.contract.id;
    navigate(path, {
      state: contractId
        ? buildContractNavigationState(contractId, { businessEventId: eventId })
        : { businessEventId: eventId }
    });
  }

  const viewToggle = (
    <Segmented
      size="small"
      value={contractView}
      onChange={(v) => setContractView(v as "list" | "kanban")}
      options={[
        { value: "list", icon: <UnorderedListOutlined />, label: "列表" },
        { value: "kanban", icon: <AppstoreOutlined />, label: "看板" },
      ]}
    />
  );
  const header = <ContractsHeader message={message} onToggleCreate={() => setShowForm((value) => !value)} extra={viewToggle} />;

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
            onOpenDetail={(contractId) => { void handleDetail(contractId); setDrawerOpen(true); }}
            onCreateEvent={(contract) => void handleCreateEvent(contract)}
            onClose={(contract, status) => void handleClose(contract, status)}
          />
        )}
      </div>
    </ContractsListPanel>
  );

  const detailView = (
    <ContractWorkbenchPanel
      detail={detail}
      creatingEventContractId={creatingEventContractId}
      onCloseDetail={() => setDetail(null)}
      onCreateEvent={(contract) => void handleCreateEvent(contract)}
      onCreateFollowupEvent={(contract, action) => void handleCreateFollowupEvent(contract, action)}
      onAutoDeriveFollowups={(contract) => void handleAutoDeriveFollowups(contract)}
      onOpenWithEvent={navigateWithEvent}
      onOpenRisk={(contractId) => navigate("/risk", { state: buildContractNavigationState(contractId) })}
      onOpenAudit={(contractId) => navigate("/audit", { state: { ...resolveContractAuditContext(contractId), ...buildContractNavigationState(contractId) } })}
    />
  );

  if (contractView === "kanban") {
    return (
      <ContractsShell
        header={header}
        createForm={createForm}
        filters={null}
        list={(
          <ContractKanbanView
            contracts={contracts}
            onSelectContract={(id) => void handleDetail(id)}
            onContractStatusChange={() => void loadContracts()}
          />
        )}
        detail={null}
      />
    );
  }

  return (
    <>
      <ContractsShell
        header={header}
        createForm={createForm}
        filters={filters}
        list={list}
        detail={detailView}
      />
      {/* Multi-tab contract drawer */}
      <ContractDrawer
        detail={detail}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onCloseContract={(status) => {
          setCloseStatus(status);
          setDrawerOpen(false);
          setCloseWizardOpen(true);
        }}
        onOpenEvent={(eventId) => navigateWithEvent("/events", eventId)}
      />
      {/* 3-step close wizard */}
      <ContractCloseWizard
        contract={detail?.contract ?? null}
        closeStatus={closeStatus}
        open={closeWizardOpen}
        onClose={() => setCloseWizardOpen(false)}
        onConfirm={async (status, _notes) => {
          if (detail) await handleClose(detail.contract, status);
          setCloseWizardOpen(false);
        }}
      />
    </>
  );
}
