/**
 * 工资代发与社保工作台（P3 代发批次 + P4 社保关账）
 * route: /payroll/transfer
 * 采用 V3 hero/section 壳层风格（对齐总账中心）。
 */
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Alert, Button, Col, Divider, Row, Space, Spin, Statistic,
  message as antdMessage,
} from "antd";
import { FileDoneOutlined } from "@ant-design/icons";
import { toast } from "sonner";
import { PageHeader } from "../components/ui/PageHeader";
import { SalaryAccountDrawer } from "./payroll-transfer/SalaryAccountDrawer";
import { SocialSecurityCloseCard } from "./payroll-transfer/SocialSecurityCloseCard";
import { TransferBatchDetailCard } from "./payroll-transfer/TransferBatchDetailCard";
import { TransferBatchListCard } from "./payroll-transfer/TransferBatchListCard";
import { useTransferBatchWorkflow } from "./payroll-transfer/useTransferBatchWorkflow";
import { usePeriod } from "../lib/period-context";
import { closeSocialSecurity } from "../lib/api";
import { useAccessUser } from "../features/runtime/useAccessUser";
import { derivePayrollTransferRuntimeSummary } from "../features/runtime/workflow-runtime";
import { WorkflowRuntimePanel } from "../features/runtime/WorkflowRuntimePanel";
import { useWorkflowRuntimeSummary } from "../features/runtime/useWorkflowRuntimeSummary";
import { normalizeDrilldownState } from "./drilldown";

export function PayrollTransferPage() {
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

  const totalAmount = batches.reduce((s, b) => s + Number(b.total_amount), 0);
  const disbursedCount = batches.filter(b => b.status === "disbursed" || b.status === "confirmed").length;
  const localRuntimeSummary = derivePayrollTransferRuntimeSummary(batches, selected?.batch ?? null, accessUser?.roleIds ?? []);
  const runtimeSummary = useWorkflowRuntimeSummary(
    "payroll-transfer",
    { batchId: selected?.batch.id ?? undefined },
    localRuntimeSummary
  );

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}><Spin /></div>;

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section className="v3-hero-shell">
        <PageHeader title="工资代发与社保" subtitle="生成银行代发文件、推进代发流程，并在工资关账后一键生成社保申报与三险一金凭证。"
          actions={<Button onClick={() => setAcctOpen(true)}>维护工资账号</Button>} />
      </section>

      <section className="v3-section-shell" data-tone="accent">
        <Row gutter={16}>
          <Col span={8}><Statistic title="代发批次" value={batches.length} prefix={<FileDoneOutlined />} /></Col>
          <Col span={8}><Statistic title="累计代发金额" value={totalAmount} precision={2} prefix="¥" /></Col>
          <Col span={8}><Statistic title="已代发批次" value={disbursedCount} valueStyle={{ color: "#16a34a" }} /></Col>
        </Row>
      </section>
      <WorkflowRuntimePanel
        title="工资代发运行态与授权态"
        summary={runtimeSummary}
        onAction={(action) => void workflow.handleRuntimeAction(action)}
        busyActionKey={runtimeActionKey}
      />

      <div className="v3-result-grid v3-result-grid--wide">
        {/* 左：批次列表 + 生成 */}
        <TransferBatchListCard
          batches={batches}
          selectedBatchId={selected?.batch.id ?? null}
          genPeriod={genPeriod}
          busy={busy}
          onGenPeriodChange={setGenPeriod}
          onGenerate={workflow.handleGenerate}
          onSelectBatch={selectBatch}
        />

        {/* 右：批次详情 + 社保关账 */}
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

              <Divider style={{ margin: "4px 0" }} />

              {/* 社保关账 */}
              <SocialSecurityCloseCard
                ssPeriod={ssPeriod}
                busy={busy}
                ssResult={ssResult}
                onSsPeriodChange={setSsPeriod}
                onClose={handleSsClose}
              />
            </Space>
          </section>
        </div>
      </div>

      <SalaryAccountDrawer
        open={acctOpen}
        onClose={() => setAcctOpen(false)}
        onSaved={() => { if (selected) void selectBatch(selected.batch.id); }}
      />
    </div>
  );
}
