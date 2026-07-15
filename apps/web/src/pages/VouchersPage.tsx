import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Row, Col, Card, Button, Space, Typography, Alert, Skeleton } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { toast } from "sonner";
import type { Voucher } from "@finance-taxation/domain-model";
import {
  approveVoucher, createVoucherFromTemplate, getVoucherDetail,
  listVouchers, listVoucherTemplates, postVoucher, updateVoucher,
  validateVoucher, type VoucherDetail, type VoucherTemplate, type WorkflowRunDetail,
} from "../lib/api";
import { normalizeDrilldownState } from "./drilldown";
import { resolveProcessFlowContext } from "../features/process-flow/resolve";
import { ProcessFlowStageSection } from "../features/process-flow/ProcessFlowStageSection";
import { PageHeader } from "../components/ui/PageHeader";
import { HelpPanel, HelpTriggerButton } from "../components/ui/HelpPanel";
import { Term } from "../components/ui/Term";
import { WorkflowRuntimeCard } from "../components/workflow/WorkflowRuntimeCard";
import { VouchersList } from "./vouchers/VouchersList";
import { VoucherDetailPanel } from "./vouchers/VoucherDetailPanel";
import { VoucherCreateModal } from "./vouchers/VoucherCreateModal";
import { useAccessUser } from "../features/runtime/useAccessUser";
import { deriveVoucherRuntimeSummary } from "../features/runtime/workflow-runtime";
import { WorkflowRuntimePanel } from "../features/runtime/WorkflowRuntimePanel";
import { useWorkflowRuntimeSummary } from "../features/runtime/useWorkflowRuntimeSummary";

const { Text } = Typography;

function VouchersHelpPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <HelpPanel
      open={open}
      title="凭证中心 · 业务关系与操作说明"
      onClose={onClose}
      relations={(
        <>
          <strong>经营事项页</strong>定义业务背景，<strong>单据中心</strong>提供发票、回单等原始依据；<strong>凭证中心</strong>把它们转成正式会计凭证并过账；过账结果流向<strong>总账中心</strong>和<strong>财务报表</strong>。标准链路：事项 / 单据 → 凭证 → 总账 / 报表。
        </>
      )}
      workflowSteps={[
        "按模板或从事项生成借贷凭证草稿",
        "执行借贷校验，确认借方合计等于贷方合计",
        "复核无误后审核凭证",
        "审核通过后执行过账，正式记入总账",
        "过账结果进入报表、税务和归档流程"
      ]}
      responsibility="这里负责管理借贷凭证的完整生命周期：草稿 → 校验 → 审核 → 过账。凭证是账本和报表的直接来源，摘要、科目和金额都在本页确定。"
      operations="常见操作包括：按模板生成凭证、选择凭证查看分录明细、执行借贷校验、审核凭证、执行过账、修改摘要，以及跳转到关联的事项、单据、税务和总账页面。"
      caution="过账是正式记账动作：过账后凭证将影响总账和财务报表，不能直接修改。发现错误需要通过冲销凭证或在总账中心反结账处理。"
    />
  );
}

export function VouchersPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const navState   = normalizeDrilldownState(location.state);
  const navEventId   = navState.businessEventId ?? null;
  const navVoucherId = navState.voucherId       ?? null;

  const [vouchers,  setVouchers]  = useState<Voucher[]>([]);
  const [templates, setTemplates] = useState<VoucherTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail,     setDetail]     = useState<VoucherDetail | null>(null);
  const [runtimeDetail, setRuntimeDetail] = useState<WorkflowRunDetail | null>(null);
  const [validation, setValidation] = useState<{
    valid: boolean; totals: { debit: string; credit: string }; issues: string[]
  } | null>(null);

  const [loading,   setLoading]   = useState(true);
  const [updating,  setUpdating]  = useState(false);
  const [creating,  setCreating]  = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [runtimeActionKey, setRuntimeActionKey] = useState<string | null>(null);
  const accessUser = useAccessUser();

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  useEffect(() => {
    async function bootstrap() {
      try {
        const [payload, tplPayload] = await Promise.all([
          listVouchers(),
          listVoucherTemplates(),
        ]);
        setVouchers(payload.items);
        setTemplates(tplPayload.items);

        const linkedId = navVoucherId
          ? payload.items.find(v => v.id === navVoucherId)?.id ?? null
          : navEventId
          ? payload.items.find(v => v.businessEventId === navEventId)?.id ?? null
          : null;
        const targetId = linkedId ?? payload.items[0]?.id ?? null;
        setSelectedId(targetId);
        if (targetId) {
          const d = await getVoucherDetail(targetId);
          setDetail(d);
        }
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setLoading(false);
      }
    }
    void bootstrap();
  }, [navEventId, navVoucherId]);

  // ── Reload state after mutations ──────────────────────────────────────────

  async function refresh(voucherId?: string) {
    const payload = await listVouchers();
    setVouchers(payload.items);
    const targetId = voucherId ?? selectedId ?? payload.items[0]?.id ?? null;
    setSelectedId(targetId);
    if (targetId) {
      const d = await getVoucherDetail(targetId);
      setDetail(d);
      setValidation(null);
    }
  }

  // ── Select voucher ────────────────────────────────────────────────────────

  async function handleSelect(id: string) {
    setSelectedId(id);
    setValidation(null);
    try {
      const d = await getVoucherDetail(id);
      setDetail(d);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  // ── Validate ──────────────────────────────────────────────────────────────

  async function handleValidate() {
    if (!detail) return;
    setUpdating(true);
    try {
      const result = await validateVoucher(detail.id);
      setValidation(result);
      if (result.valid) toast.success("借贷校验通过");
      else toast.error("借贷不平衡，请检查分录");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUpdating(false);
    }
  }

  // ── Approve ───────────────────────────────────────────────────────────────

  async function handleApprove() {
    if (!detail) return;
    setUpdating(true);
    try {
      await approveVoucher(detail.id);
      await refresh(detail.id);
      toast.success("凭证已审核");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUpdating(false);
    }
  }

  // ── Post ──────────────────────────────────────────────────────────────────

  async function handlePost() {
    if (!detail) return;
    setUpdating(true);
    try {
      await postVoucher(detail.id);
      await refresh(detail.id);
      toast.success("凭证已过账，将影响总账和报表");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUpdating(false);
    }
  }

  // ── Update summary ────────────────────────────────────────────────────────

  async function handleSummaryUpdate(summary: string) {
    if (!detail) return;
    try {
      await updateVoucher(detail.id, { summary });
      await refresh(detail.id);
      toast.success("摘要已更新");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  // ── Create from template ──────────────────────────────────────────────────

  async function handleCreate(form: {
    templateKey: string; businessEventId: string; amount: string; summary: string;
  }) {
    setCreating(true);
    try {
      const created = await createVoucherFromTemplate(form);
      await refresh(created.id);
      setModalOpen(false);
      toast.success(`已按模板 ${form.templateKey} 生成凭证草稿`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  // ── Process flow context ──────────────────────────────────────────────────

  const voucherFlowContext = useMemo(() => {
    if (!detail) return null;
    return resolveProcessFlowContext({
      event: { id: detail.businessEventId || detail.id, type: "general", title: detail.summary, status: detail.status },
      detail: {
        tasks: [{ id: `${detail.id}-task-stage` }],
        generatedDocuments: [{ id: `${detail.businessEventId || detail.id}-document-stage` }],
        vouchers: [{ id: detail.id }],
        taxItems: [],
        hasArchivedArtifacts: Boolean(detail.postedAt),
      },
    });
  }, [detail]);
  const localRuntimeSummary = useMemo(
    () => deriveVoucherRuntimeSummary(vouchers, detail, accessUser?.roleIds ?? []),
    [accessUser?.roleIds, detail, vouchers]
  );
  const runtimeSummary = useWorkflowRuntimeSummary(
    "vouchers",
    {
      businessEventId: navEventId ?? undefined,
      voucherId: detail?.id ?? selectedId ?? undefined
    },
    localRuntimeSummary
  );

  async function handleRuntimeAction(action: NonNullable<typeof runtimeSummary.actions>[number]) {
    if (action.key !== "retry-voucher-validate" || !action.params?.voucherId) {
      return;
    }
    setRuntimeActionKey(action.key);
    try {
      const result = await validateVoucher(action.params.voucherId);
      setValidation(result);
      if (result.valid) {
        toast.success("凭证重新校验通过");
      } else {
        toast.error(result.issues[0] || "凭证仍未通过校验");
      }
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setRuntimeActionKey(null);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {/* Hero header */}
      <section className="v3-hero-shell">
        <PageHeader
          title="凭证中心"
          actions={(
            <Space>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>按模板生成</Button>
              <HelpTriggerButton onClick={() => setHelpOpen(true)} label="查看凭证中心操作说明" />
            </Space>
          )}
        />
        <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "var(--text-muted, #6c7a89)", lineHeight: 1.7 }}>
          管理<Term k="debit-credit-balance">借贷</Term><Term k="voucher">凭证</Term>草稿、审核与
          <Term k="posting">过账</Term>：流程为 草稿 → 审核 → <Term k="posting">过账</Term>，
          <Term k="posting">过账</Term>后将影响<Term k="general-ledger">总账</Term>和财务报表
        </p>
      </section>

      <VouchersHelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />

      {navEventId && (
        <Alert
          type="info" showIcon style={{ borderRadius: 8 }}
          message={<>当前筛选事项 <Text code>{navEventId}</Text> 的关联凭证。</>}
        />
      )}
      <WorkflowRuntimePanel
        title="凭证运行态与授权态"
        summary={runtimeSummary}
        onAction={(action) => void handleRuntimeAction(action)}
        busyActionKey={runtimeActionKey}
      />

      <WorkflowRuntimeCard
        title="凭证运行态 / 授权态"
        resourceType="voucher"
        resourceId={detail?.id ?? selectedId}
        emptyHint="选择凭证后，可查看该凭证的运行状态、授权状态、重试与补偿信息。"
        onChanged={() => refresh(detail?.id ?? selectedId ?? undefined)}
        onDetailChange={setRuntimeDetail}
      />

      {/* Process flow */}
      {detail && (
        <ProcessFlowStageSection
          title="凭证阶段流程"
          subtitle="凭证处理阶段在整体业务流程中的位置"
          currentNodeId={voucherFlowContext?.currentNodeId ?? "voucher_tax_processing"}
          branch={voucherFlowContext?.branch}
          businessEventId={detail.businessEventId}
        />
      )}

      {/* Main layout: list + detail */}
      <section className="v3-section-shell">
        {loading ? (
          <Card style={{ borderRadius: 12 }}>
            <Skeleton active paragraph={{ rows: 8 }} />
          </Card>
        ) : (
          <Row gutter={[16, 16]}>
            {/* Left: voucher list with status tabs */}
            <Col xs={24} lg={13}>
              <Card
                title={<Space><Text strong>凭证对象</Text></Space>}
                style={{ borderRadius: 12 }}
                styles={{ body: { padding: "0 0 8px" } }}
              >
                <VouchersList
                  vouchers={vouchers}
                  selectedId={selectedId}
                  onSelect={id => void handleSelect(id)}
                />
              </Card>
            </Col>

            {/* Right: voucher detail */}
            <Col xs={24} lg={11}>
              <Card style={{ borderRadius: 12 }}>
                <VoucherDetailPanel
                  detail={detail}
                  runtimeDetail={runtimeDetail}
                  validation={validation}
                  updating={updating}
                  onValidate={handleValidate}
                  onApprove={handleApprove}
                  onPost={handlePost}
                  onSummaryUpdate={handleSummaryUpdate}
                  onOpenEvent={(businessEventId) => navigate("/events", { state: { businessEventId } })}
                  onOpenDocuments={(businessEventId) => navigate("/documents", { state: { businessEventId } })}
                  onOpenTax={(businessEventId) => navigate("/tax", { state: { businessEventId } })}
                  onOpenLedger={(voucherId, businessEventId) => navigate("/ledger", { state: { voucherId, businessEventId } })}
                />
              </Card>
            </Col>
          </Row>
        )}
      </section>

      {/* Create modal */}
      <VoucherCreateModal
        open={modalOpen}
        templates={templates}
        initialEventId={navEventId ?? undefined}
        creating={creating}
        onSubmit={handleCreate}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
