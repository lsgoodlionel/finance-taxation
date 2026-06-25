import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Row, Col, Card, Button, Space, Typography, Alert, Skeleton } from "antd";
import { PlusOutlined, QuestionCircleOutlined } from "@ant-design/icons";
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
import { WorkflowRuntimeCard } from "../components/workflow/WorkflowRuntimeCard";
import { VouchersList } from "./vouchers/VouchersList";
import { VoucherDetailPanel } from "./vouchers/VoucherDetailPanel";
import { VoucherCreateModal } from "./vouchers/VoucherCreateModal";

const { Text } = Typography;

export function VouchersPage() {
  const location = useLocation();
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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {/* Hero header */}
      <section className="v3-hero-shell">
        <PageHeader
          title="凭证中心"
          subtitle="管理借贷凭证草稿、审核与过账，影响总账和财务报表"
          actions={(
            <Space>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>按模板生成</Button>
              <Button icon={<QuestionCircleOutlined />} size="small" />
            </Space>
          )}
        />
      </section>

      {navEventId && (
        <Alert
          type="info" showIcon style={{ borderRadius: 8 }}
          message={<>当前筛选事项 <Text code>{navEventId}</Text> 的关联凭证。</>}
        />
      )}

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
