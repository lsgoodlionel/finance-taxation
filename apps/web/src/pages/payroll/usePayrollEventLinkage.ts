import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { NavigateFunction } from "react-router-dom";
import type { PayrollRecord, PayrollTaxReviewLedger } from "@finance-taxation/domain-model";
import {
  analyzeEvent,
  createEvent,
  listEvents,
  runEventRiskCheck,
  syncPayrollReviewLedgers
} from "../../lib/api";
import type { WorkflowRuntimeAction } from "../../features/runtime/workflow-runtime";
import { buildPayrollEventInput } from "../payroll-event";
import { buildPayrollNavigationState } from "./payroll-page-helpers";

export interface PayrollEventLinkageInput {
  selectedPeriod: string;
  payrollRecords: PayrollRecord[];
  setReviewLedgers: Dispatch<SetStateAction<PayrollTaxReviewLedger[]>>;
  setMessage: (message: string) => void;
  navigate: NavigateFunction;
}

export interface PayrollEventLinkageState {
  linkedEventIds: Record<string, string>;
  linkedEventId: string | null;
  creatingEventPeriod: string | null;
  runtimeActionKey: string | null;
  rememberLinkedEvent: (period: string, eventId: string) => void;
  handleCreatePayrollEvent: () => Promise<void>;
  navigateWithEvent: (path: string, extraState?: Record<string, string>) => void;
  handlePayrollRiskCheck: () => Promise<void>;
  handleSyncReviewLedgers: () => Promise<void>;
  handleRuntimeAction: (action: WorkflowRuntimeAction) => Promise<void>;
}

export function usePayrollEventLinkage({
  selectedPeriod,
  payrollRecords,
  setReviewLedgers,
  setMessage,
  navigate
}: PayrollEventLinkageInput): PayrollEventLinkageState {
  const [linkedEventIds, setLinkedEventIds] = useState<Record<string, string>>({});
  const [creatingEventPeriod, setCreatingEventPeriod] = useState<string | null>(null);
  const [runtimeActionKey, setRuntimeActionKey] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("payroll_linked_event_ids");
      if (raw) {
        setLinkedEventIds(JSON.parse(raw) as Record<string, string>);
      }
    } catch {
      // ignore broken session payloads
    }
  }, []);

  const linkedEventId = selectedPeriod ? linkedEventIds[selectedPeriod] ?? null : null;

  function rememberLinkedEvent(period: string, eventId: string) {
    setLinkedEventIds((current) => {
      const next = { ...current, [period]: eventId };
      sessionStorage.setItem("payroll_linked_event_ids", JSON.stringify(next));
      return next;
    });
  }

  async function handleCreatePayrollEvent() {
    if (!selectedPeriod || payrollRecords.length === 0) {
      setMessage("请先选择并生成工资期间数据。");
      return;
    }

    setCreatingEventPeriod(selectedPeriod);
    try {
      const input = buildPayrollEventInput(selectedPeriod, payrollRecords);
      const existingEvents = await listEvents();
      const existing = existingEvents.items.find(
        (event) => event.type === "payroll" && event.title === input.title
      );
      const event = existing ?? await createEvent(input);
      await analyzeEvent(event.id);
      const ledgers = await syncPayrollReviewLedgers({
        period: selectedPeriod,
        businessEventId: event.id
      });
      setReviewLedgers(ledgers.items);
      rememberLinkedEvent(selectedPeriod, event.id);
      setMessage(`已将 ${selectedPeriod} 工资期接入事项主线，并同步 ${ledgers.total} 本税务复核台账。`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setCreatingEventPeriod(null);
    }
  }

  function navigateWithEvent(path: string, extraState?: Record<string, string>) {
    const eventId = linkedEventIds[selectedPeriod];
    if (!eventId) {
      setMessage("请先生成工资事项，再进入任务、税务或凭证中心。");
      return;
    }
    navigate(path, { state: buildPayrollNavigationState(selectedPeriod, eventId, extraState) });
  }

  async function handlePayrollRiskCheck() {
    const eventId = linkedEventIds[selectedPeriod];
    if (!eventId) {
      setMessage("请先生成工资事项，再执行风险检查。");
      return;
    }
    try {
      const result = await runEventRiskCheck(eventId);
      setMessage(`工资事项风险检查完成，生成 ${result.total} 条发现。`);
      navigate("/risk", {
        state: buildPayrollNavigationState(selectedPeriod, eventId, {
          focus: "payroll-risk",
          riskScope: "payroll"
        })
      });
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function handleSyncReviewLedgers() {
    if (!selectedPeriod) {
      setMessage("请先选择工资期间。");
      return;
    }
    try {
      const res = await syncPayrollReviewLedgers({
        period: selectedPeriod,
        businessEventId: linkedEventId
      });
      setReviewLedgers(res.items);
      setMessage(`已同步 ${res.total} 本工资税务复核台账。`);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function handleRuntimeAction(action: WorkflowRuntimeAction) {
    setRuntimeActionKey(action.key);
    try {
      if (action.key === "sync-payroll-review-ledgers") {
        await handleSyncReviewLedgers();
        return;
      }
      if (action.key === "create-payroll-event") {
        await handleCreatePayrollEvent();
        return;
      }
      setMessage(`已触发“${action.label}”，请按工资流程继续处理。`);
    } finally {
      setRuntimeActionKey(null);
    }
  }

  return {
    linkedEventIds,
    linkedEventId,
    creatingEventPeriod,
    runtimeActionKey,
    rememberLinkedEvent,
    handleCreatePayrollEvent,
    navigateWithEvent,
    handlePayrollRiskCheck,
    handleSyncReviewLedgers,
    handleRuntimeAction
  };
}
