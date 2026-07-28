/**
 * 工资代发（P3 代发批次）与社保关账（P4）的两件事。
 *
 * V10 车道 B1：本页不再自持壳层。改造前它是 /payroll 域 Tab 下的一整页——
 * 自己又摆了一次 PageHeader、一排三个 Statistic、运行态面板，再把「代发批次」
 * 和「社保关账」并排塞进左右两栏。用户点两层 Tab 进来，看到的仍是两件不相干的事。
 *
 * 现在由 PayrollDomainPage 的 TaskFocusShell 统一决定「当前在做哪件事」，本组件
 * 按 activeTask 只渲染其中一件：
 * - transfer：这笔代发办到哪了（ObjectFlowBar）+ 批次清单/明细；
 * - social：社保关账。
 * 三个 Statistic 并进了 TransferBatchListCard 的表头汇总行；状态文案与运行态
 * 合成一块 PayrollTaskContext 收在工作区之后，且一切正常时折叠
 * （同 /tax、/vouchers 的 needsRuntimeAttention 口径）。
 */
import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Alert, Space, Spin, message as antdMessage } from "antd";
import { toast } from "sonner";
import { ObjectFlowBar } from "../components/ui/ObjectFlowBar";
import { Term } from "../components/ui/Term";
import { SalaryAccountDrawer } from "./payroll-transfer/SalaryAccountDrawer";
import { SocialSecurityCloseCard } from "./payroll-transfer/SocialSecurityCloseCard";
import { TransferBatchDetailCard } from "./payroll-transfer/TransferBatchDetailCard";
import { TransferBatchListCard } from "./payroll-transfer/TransferBatchListCard";
import { buildTransferBatchFlow, buildTransferBatchFlowTitle } from "./payroll-transfer/transfer-batch-flow";
import { useTransferBatchWorkflow } from "./payroll-transfer/useTransferBatchWorkflow";
import { usePeriod } from "../lib/period-context";
import { closeSocialSecurity } from "../lib/api";
import { useAccessUser } from "../features/runtime/useAccessUser";
import { derivePayrollTransferRuntimeSummary } from "../features/runtime/workflow-runtime";
import { WorkflowRuntimePanel } from "../features/runtime/WorkflowRuntimePanel";
import { useWorkflowRuntimeSummary } from "../features/runtime/useWorkflowRuntimeSummary";
import { needsRuntimeAttention } from "../features/runtime/runtime-attention";
import { normalizeDrilldownState } from "./drilldown";
import { PayrollTaskContext } from "./payroll/PayrollTaskContext";
import { PAYROLL_TASK_KEYS, type PayrollTaskKey } from "./payroll/payroll-tasks";

const HINT_STYLE: React.CSSProperties = { margin: 0, fontSize: 13, lineHeight: 1.7, color: "#6c7a89" };

export interface PayrollTransferPageProps {
  /** 由 PayrollDomainPage 的任务切换器决定；缺省时按「发工资」渲染。 */
  activeTask?: PayrollTaskKey;
}

export function PayrollTransferPage({ activeTask = PAYROLL_TASK_KEYS.transfer }: PayrollTransferPageProps) {
  const location = useLocation();
  const navState = normalizeDrilldownState(location.state);
  const navBatchId = navState.resourceType === "payroll_transfer_batch" ? navState.resourceId ?? null : null;
  const navPayrollPeriod = navState.payrollPeriod ?? null;
  const { period: globalPeriod } = usePeriod();
  const [genPeriod, setGenPeriod] = useState(globalPeriod);
  const [ssPeriod, setSsPeriod] = useState(globalPeriod);

  // 全局期间变化时同步页内默认期间
  useEffect(() => { setGenPeriod(globalPeriod); setSsPeriod(globalPeriod); }, [globalPeriod]);
  const [ssResult, setSsResult] = useState<string | null>(null);
  const [acctOpen, setAcctOpen] = useState(false);
  const accessUser = useAccessUser();

  const workflow = useTransferBatchWorkflow(genPeriod);
  const { batches, selected, loading, busy, setBusy, runtimeActionKey, batchAuditLogs, selectBatch } = workflow;

  useEffect(() => {
    if (!navPayrollPeriod) {
      return;
    }
    setGenPeriod(navPayrollPeriod);
    setSsPeriod(navPayrollPeriod);
  }, [navPayrollPeriod]);

  useEffect(() => {
    if (!navBatchId || selected?.batch.id === navBatchId) {
      return;
    }
    void selectBatch(navBatchId);
  }, [navBatchId, selected?.batch.id]);

  async function handleSsClose() {
    if (!/^\d{4}-\d{2}$/.test(ssPeriod)) { toast.error("期间格式应为 YYYY-MM"); return; }
    setBusy(true); setSsResult(null);
    try {
      const r = await closeSocialSecurity(ssPeriod);
      const s = r.summary;
      const total = s.socialSecurityEmployer + s.socialSecurityEmployee + s.housingFundEmployer + s.housingFundEmployee;
      setSsResult(`✅ ${ssPeriod} 社保关账完成：三险一金合计 ¥${total.toFixed(2)}，已生成 ${r.voucherIds.length} 张凭证草稿（计提+缴纳）、社保申报事项与任务。`);
      toast.success("社保关账完成，已生成三险一金凭证");
    } catch (err) {
      antdMessage.error((err as Error).message);
      setSsResult(`❌ ${(err as Error).message}`);
    } finally { setBusy(false); }
  }

  const localRuntimeSummary = derivePayrollTransferRuntimeSummary(batches, selected?.batch ?? null, accessUser?.roleIds ?? []);
  const runtimeSummary = useWorkflowRuntimeSummary(
    "payroll-transfer",
    { batchId: selected?.batch.id ?? undefined },
    localRuntimeSummary
  );
  const runtimeAttention = needsRuntimeAttention(runtimeSummary);

  const runtimePanel = (
    <WorkflowRuntimePanel
      title="工资代发运行态与授权态"
      summary={runtimeSummary}
      onAction={(action) => void workflow.handleRuntimeAction(action)}
      busyActionKey={runtimeActionKey}
    />
  );

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}><Spin /></div>;

  if (activeTask === PAYROLL_TASK_KEYS.social) {
    return (
      <>
        <SocialSecurityCloseCard
          ssPeriod={ssPeriod}
          busy={busy}
          ssResult={ssResult}
          onSsPeriodChange={setSsPeriod}
          onClose={handleSsClose}
        />
        {/*
          社保关账刻意不画 ObjectFlowBar：关账的结果只存在于本次调用的返回值里
          （凭证 id 列表 + 合计），页面没有一个可复查的「关账对象」及其字段，
          刷新之后连「这个月关过没有」都读不回来。没有支撑字段就不画流程步骤。
        */}
        <p style={HINT_STYLE}>
          关账要求该期间的工资已经全部确认，所以正常次序是先「算这个月的工资」、再「发这个月的工资」，最后在这里关账。
          关账生成的是<Term k="voucher">凭证</Term>草稿，仍需到凭证中心复核后<Term k="posting">过账</Term>。
        </p>
        <PayrollTaskContext
          message={ssResult ?? `准备对 ${ssPeriod} 做社保公积金关账。`}
          runtime={runtimePanel}
          runtimeAttention={runtimeAttention}
        />
      </>
    );
  }

  const batchFlow = buildTransferBatchFlow(selected?.batch ?? null);

  return (
    <>
      {batchFlow ? (
        <ObjectFlowBar flow={batchFlow} title={buildTransferBatchFlowTitle(selected?.batch ?? null)} />
      ) : (
        <p style={HINT_STYLE}>
          还没有选中代发批次。在下面的清单里点一个批次，这里就会显示这笔钱办到哪一步、下一步该谁做。
        </p>
      )}

      <div className="v3-result-grid v3-result-grid--wide">
        <TransferBatchListCard
          batches={batches}
          selectedBatchId={selected?.batch.id ?? null}
          genPeriod={genPeriod}
          busy={busy}
          onGenPeriodChange={setGenPeriod}
          onGenerate={workflow.handleGenerate}
          onSelectBatch={selectBatch}
          onOpenSalaryAccounts={() => setAcctOpen(true)}
        />

        <div className="v3-workbench-card">
          <section className="v3-section-shell">
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              {selected ? (
                <TransferBatchDetailCard
                  selected={selected}
                  busy={busy}
                  batchAuditLogs={batchAuditLogs}
                  onApprove={workflow.handleApprove}
                  onDownload={workflow.handleDownload}
                  onDisburse={workflow.handleDisburse}
                  onCompensate={workflow.handleCompensate}
                />
              ) : (
                <Alert type="info" showIcon message="从左侧选择代发批次查看明细与操作，或先生成新批次。" />
              )}
            </Space>
          </section>
        </div>
      </div>

      <PayrollTaskContext
        message={
          selected
            ? `当前批次 ${selected.batch.id}（${selected.batch.payroll_period}），共 ${batches.length} 个代发批次。`
            : `共 ${batches.length} 个代发批次，尚未选中任何一笔。`
        }
        runtime={runtimePanel}
        runtimeAttention={runtimeAttention}
      />

      <SalaryAccountDrawer
        open={acctOpen}
        onClose={() => setAcctOpen(false)}
        onSaved={() => { if (selected) void selectBatch(selected.batch.id); }}
      />
    </>
  );
}
