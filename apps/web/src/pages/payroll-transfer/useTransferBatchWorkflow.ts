import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import type { AuditLog } from "@finance-taxation/domain-model";
import {
  approveTransferBatch, buildTransferBatch, compensateTransferBatch, disburseTransferBatch,
  downloadTransferFile, getTransferBatch, listAuditLogs, listTransferBatches,
  type PayrollTransferBatch, type PayrollTransferLine,
} from "../../lib/api";
import type { WorkflowRuntimeAction } from "../../features/runtime/workflow-runtime";

export interface TransferBatchSelection {
  batch: PayrollTransferBatch;
  lines: PayrollTransferLine[];
}

export interface TransferBatchWorkflowState {
  batches: PayrollTransferBatch[];
  selected: TransferBatchSelection | null;
  loading: boolean;
  busy: boolean;
  setBusy: Dispatch<SetStateAction<boolean>>;
  runtimeActionKey: string | null;
  batchAuditLogs: AuditLog[];
  selectBatch: (id: string) => Promise<void>;
  handleGenerate: () => Promise<void>;
  handleApprove: () => Promise<void>;
  handleDownload: (format: "generic" | "cmb") => Promise<void>;
  handleDisburse: () => Promise<void>;
  handleCompensate: () => Promise<void>;
  handleRuntimeAction: (action: WorkflowRuntimeAction) => Promise<void>;
}

export function useTransferBatchWorkflow(genPeriod: string): TransferBatchWorkflowState {
  const [batches, setBatches] = useState<PayrollTransferBatch[]>([]);
  const [selected, setSelected] = useState<TransferBatchSelection | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [runtimeActionKey, setRuntimeActionKey] = useState<string | null>(null);
  const [batchAuditLogs, setBatchAuditLogs] = useState<AuditLog[]>([]);

  const loadBatches = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listTransferBatches();
      setBatches(data.items);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadBatches(); }, [loadBatches]);

  async function selectBatch(id: string) {
    try {
      const detail = await getTransferBatch(id);
      setSelected(detail);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  useEffect(() => {
    async function loadAuditTrail() {
      if (!selected?.batch.id) {
        setBatchAuditLogs([]);
        return;
      }
      try {
        const [batchAuditRes, eventAuditRes] = await Promise.all([
          listAuditLogs({
            resourceType: "payroll_transfer_batch",
            resourceId: selected.batch.id,
            limit: 20
          }),
          selected.batch.compensation_event_id
            ? listAuditLogs({
                resourceType: "business_event",
                resourceId: selected.batch.compensation_event_id,
                limit: 10
              }).catch(() => ({ items: [], total: 0, limit: 10, offset: 0 }))
            : Promise.resolve({ items: [], total: 0, limit: 10, offset: 0 })
        ]);
        const merged = [...batchAuditRes.items, ...eventAuditRes.items]
          .filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index)
          .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
        setBatchAuditLogs(merged);
      } catch {
        setBatchAuditLogs([]);
      }
    }
    void loadAuditTrail();
  }, [selected?.batch.id, selected?.batch.compensation_event_id]);

  async function handleGenerate() {
    if (!/^\d{4}-\d{2}$/.test(genPeriod)) { toast.error("期间格式应为 YYYY-MM"); return; }
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const r = await buildTransferBatch(genPeriod);
      toast.success(`已生成 ${genPeriod} 代发批次：${r.employeeCount} 人，合计 ¥${r.totalAmount.toFixed(2)}${r.skipped ? `，${r.skipped} 人缺账号跳过` : ""}`);
      await loadBatches();
      await selectBatch(r.batchId);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function handleApprove() {
    if (!selected) return;
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await approveTransferBatch(selected.batch.id);
      toast.success("批次已审批");
      await loadBatches(); await selectBatch(selected.batch.id);
    } catch (err) { toast.error((err as Error).message); } finally { busyRef.current = false; setBusy(false); }
  }

  async function handleDownload(format: "generic" | "cmb") {
    if (!selected) return;
    try {
      const blob = await downloadTransferFile(selected.batch.id, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${format === "cmb" ? "招行代发" : "工资代发"}_${selected.batch.payroll_period}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      await loadBatches(); await selectBatch(selected.batch.id);
    } catch (err) { toast.error((err as Error).message); }
  }

  async function handleDisburse() {
    if (!selected) return;
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const r = await disburseTransferBatch(selected.batch.id);
      const reused = "reused" in r && Boolean(r.reused);
      toast.success(reused ? `已复用经营事项 ${r.eventId}` : `已标记代发完成，联动生成经营事项 ${r.eventId}`);
      await loadBatches(); await selectBatch(selected.batch.id);
    } catch (err) { toast.error((err as Error).message); } finally { busyRef.current = false; setBusy(false); }
  }

  async function handleCompensate() {
    if (!selected) return;
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await compensateTransferBatch(selected.batch.id);
      toast.success(result.reused ? `已复用补偿事项 ${result.eventId}` : `已补偿生成经营事项 ${result.eventId}`);
      await loadBatches();
      await selectBatch(selected.batch.id);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function handleRuntimeAction(action: WorkflowRuntimeAction) {
    const actionBatchId = action.params?.batchId ?? selected?.batch.id;
    const isCompensationAction = [
      "retry-payroll-transfer-compensation",
      "compensate-transfer-batch",
      "mock-runtime-repair"
    ].includes(action.key);

    if (!isCompensationAction || !actionBatchId) {
      toast.info("当前修复动作需要先定位到具体代发批次。");
      return;
    }

    if (busyRef.current) return;
    busyRef.current = true;
    setRuntimeActionKey(action.key);
    setBusy(true);
    try {
      const result = await compensateTransferBatch(actionBatchId);
      toast.success(result.reused ? `已复用补偿事项 ${result.eventId}` : `已补偿生成经营事项 ${result.eventId}`);
      await loadBatches();
      await selectBatch(actionBatchId);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
      setRuntimeActionKey(null);
    }
  }

  return {
    batches,
    selected,
    loading,
    busy,
    setBusy,
    runtimeActionKey,
    batchAuditLogs,
    selectBatch,
    handleGenerate,
    handleApprove,
    handleDownload,
    handleDisburse,
    handleCompensate,
    handleRuntimeAction
  };
}
