import type { Contract } from "@finance-taxation/domain-model";
import { useI18n, EVENT_STATUS_LABELS } from "../../lib/i18n";
import { type ContractFollowupAction, getContractFollowupActions } from "../contract-event";
import { buildContractAutoDerivationPlan } from "../contract-automation";
import { buildContractTimeline } from "../contract-timeline";
import { buildContractWorkflow } from "../contract-workflow";
import { ContractsWorkbench } from "./ContractsWorkbench";
import { ContractFollowupActions, ContractWorkflowSummary } from "./ContractWorkflowSummary";
import { ContractObjectOverview, ContractWorkbenchActions } from "./ContractObjectOverview";
import { ContractRelatedEventsTable } from "./ContractRelatedEventsTable";
import { ContractMetadataGrid } from "./ContractMetadataGrid";
import { ContractTimelinePanel } from "./ContractTimelinePanel";
import { EmptyState } from "../../components/ui/EmptyState";
import {
  CONTRACT_TYPE_LABELS,
  FOLLOWUP_ACTION_LABELS,
  STATUS_LABELS,
  WORKFLOW_STATE_LABELS,
  WORKFLOW_STATE_STYLES,
  panelStyle,
  type ContractDetailView
} from "./contracts-page-meta";

// ─── 合同工作台面板（详情 / 空态） ────────────────────────────────────────────

interface ContractWorkbenchPanelProps {
  detail: ContractDetailView | null;
  creatingEventContractId: string | null;
  onCloseDetail: () => void;
  onCreateEvent: (contract: Contract) => void;
  onCreateFollowupEvent: (contract: Contract, action: ContractFollowupAction) => void;
  onAutoDeriveFollowups: (contract: Contract) => void;
  onOpenWithEvent: (path: string, eventId: string) => void;
  onOpenRisk: (contractId: string) => void;
  onOpenAudit: (contractId: string) => void;
}

export function ContractWorkbenchPanel({
  detail,
  creatingEventContractId,
  onCloseDetail,
  onCreateEvent,
  onCreateFollowupEvent,
  onAutoDeriveFollowups,
  onOpenWithEvent,
  onOpenRisk,
  onOpenAudit
}: ContractWorkbenchPanelProps) {
  const { t } = useI18n();

  if (!detail) {
    return (
      <ContractsWorkbench>
        <div style={panelStyle()}>
          <EmptyState
            title="选择一份合同查看工作台"
            description="右侧会优先显示履约流程摘要、下一步动作、关联事项以及税务/凭证联动结果。"
          />
        </div>
      </ContractsWorkbench>
    );
  }

  const firstRelatedEvent = detail.relatedEvents[0] ?? null;
  const timeline = buildContractTimeline({
    contract: detail.contract,
    relatedEvents: detail.relatedEvents
  });
  const autoDerivationPlan = buildContractAutoDerivationPlan({
    contract: detail.contract,
    relatedEvents: detail.relatedEvents
  });
  const workflow = buildContractWorkflow({
    contract: detail.contract,
    relatedEvents: detail.relatedEvents
  });

  return (
    <ContractsWorkbench>
      <div style={panelStyle()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: "16px" }}>{detail.contract.title}</h3>
          <button
            onClick={onCloseDetail}
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
          onCreateAction={(action) => onCreateFollowupEvent(detail.contract, action as ContractFollowupAction)}
          onAutoCreate={() => onAutoDeriveFollowups(detail.contract)}
          onOpenEvent={(eventId) => onOpenWithEvent("/events", eventId)}
        />
        <ContractTimelinePanel
          items={timeline}
          stateLabels={WORKFLOW_STATE_LABELS}
          stateStyles={WORKFLOW_STATE_STYLES}
          onOpenEvent={(eventId) => onOpenWithEvent("/events", eventId)}
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
          onCreateRelatedEvent={() => onCreateEvent(detail.contract)}
          onOpenEvents={() => firstRelatedEvent ? onOpenWithEvent("/events", firstRelatedEvent.id) : undefined}
          onOpenTasks={() => detail.relatedTasks[0]?.businessEventId ? onOpenWithEvent("/tasks", detail.relatedTasks[0].businessEventId) : undefined}
          onOpenTax={() => detail.relatedTaxItems[0]?.businessEventId ? onOpenWithEvent("/tax", detail.relatedTaxItems[0].businessEventId) : undefined}
          onOpenVouchers={() => detail.relatedVouchers[0]?.businessEventId ? onOpenWithEvent("/vouchers", detail.relatedVouchers[0].businessEventId) : undefined}
          onOpenRisk={() => onOpenRisk(detail.contract.id)}
          onOpenAudit={() => onOpenAudit(detail.contract.id)}
        />
        <ContractRelatedEventsTable
          title="关联经营事项"
          events={detail.relatedEvents}
          statusLabel={(status) => t(EVENT_STATUS_LABELS, status)}
          onOpenEvent={(eventId) => onOpenWithEvent("/events", eventId)}
          onOpenTasks={(eventId) => onOpenWithEvent("/tasks", eventId)}
          onOpenTax={(eventId) => onOpenWithEvent("/tax", eventId)}
          onOpenVouchers={(eventId) => onOpenWithEvent("/vouchers", eventId)}
        />
      </div>
    </ContractsWorkbench>
  );
}
