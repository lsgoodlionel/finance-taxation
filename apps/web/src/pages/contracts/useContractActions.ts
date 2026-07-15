import { useState } from "react";
import type { Contract } from "@finance-taxation/domain-model";
import {
  analyzeEvent,
  closeContract,
  createContract,
  createEvent,
  listEvents
} from "../../lib/api";
import {
  type ContractFollowupAction,
  buildContractEventInput,
  buildContractFollowupEventInput,
  buildContractTerminalEventInput
} from "../contract-event";
import { buildContractAutoDerivationPlan } from "../contract-automation";
import { STATUS_LABELS, type ContractDetailView, type RelatedEventView } from "./contracts-page-meta";

// ─── ContractsPage 写操作（新建/关闭/派生事项）状态与处理器 ───────────────────

export interface ContractFormState {
  contractType: string;
  title: string;
  counterpartyName: string;
  counterpartyType: string;
  amount: string;
  currency: string;
  signedDate: string;
  startDate: string;
  endDate: string;
  notes: string;
}

interface UseContractActionsParams {
  detail: ContractDetailView | null;
  loadContracts: () => Promise<void>;
  handleDetail: (contractId: string) => Promise<void>;
  setMessage: (message: string) => void;
  closeCreateForm: () => void;
}

export function useContractActions({
  detail,
  loadContracts,
  handleDetail,
  setMessage,
  closeCreateForm
}: UseContractActionsParams) {
  const [creatingEventContractId, setCreatingEventContractId] = useState<string | null>(null);
  const [form, setForm] = useState<ContractFormState>({
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
    closeCreateForm();
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

  return {
    form,
    setForm,
    creatingEventContractId,
    handleCreate,
    handleClose,
    handleCreateEvent,
    handleCreateFollowupEvent,
    handleAutoDeriveFollowups
  };
}
