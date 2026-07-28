/**
 * 凭证中心（V10 车道 G2：按任务重组）。
 *
 * 改造前首屏 7 块，其中两块（WorkflowRuntimePanel / WorkflowRuntimeCard）标题几乎
 * 一样、讲的都是「运行态与授权态」，还有一块阶段流程图是用页面现造的占位对象喂
 * resolveProcessFlowContext 算出来的，结果基本恒定；而凭证真正的流程
 * （草稿 → 校验 → 审核 → 过账）在界面上反倒没有表达，「下一步做什么」只有快捷键 a
 * 知道。
 *
 * 改造后固定四段（筛选提示按需出现，最多五段，顺序钉在 vouchers/VouchersShell）：
 *   页头 → [事项筛选提示] → 这张凭证办到哪了 + 下一步 → 列表与详情 → 运行态（折叠）
 */
// 显式引入 React：仓库的 node 测试用经典 JSX 转换（见 tools/v4/run-web-tests.mjs），
// 缺了它这一页就无法在测试里被整页渲染（首屏区块数就只能靠人肉数）。
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button, Space, Modal } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { toast } from "sonner";
import type { Voucher } from "@finance-taxation/domain-model";
import {
  approveVoucher, createVoucherFromTemplate, getVoucherDetail,
  listVouchers, listVoucherTemplates, postVoucher, updateVoucher,
  validateVoucher, type VoucherDetail, type VoucherTemplate, type WorkflowRunDetail,
} from "../lib/api";
import { normalizeDrilldownState } from "./drilldown";
import { EntityLink } from "../components/ui/EntityLink";
import { PageHeader } from "../components/ui/PageHeader";
import { HelpTriggerButton } from "../components/ui/HelpPanel";
import { Term } from "../components/ui/Term";
import { VoucherCreateModal } from "./vouchers/VoucherCreateModal";
import { VoucherFlowPanel } from "./vouchers/VoucherFlowPanel";
import { VoucherRuntimeSection } from "./vouchers/VoucherRuntimeSection";
import { VouchersHelpPanel } from "./vouchers/VouchersHelpPanel";
import { VouchersShell } from "./vouchers/VouchersShell";
import { VouchersWorkspace } from "./vouchers/VouchersWorkspace";
import { useVoucherBatch } from "./vouchers/useVoucherBatch";
import { buildValidationHints } from "./vouchers/validation-hints";
import {
  buildVoucherFlow, buildVoucherFlowTitle, buildVoucherNextStep, buildVoucherReportPeriod,
} from "./vouchers/voucher-flow";
import {
  filterVouchersByTab, formatVoucherCode, resolveNextAction, voucherAmount, type VoucherTab,
} from "./vouchers/voucher-actions";
import { useListHotkeys } from "../lib/use-list-hotkeys";
import { useAccessUser } from "../features/runtime/useAccessUser";
import { deriveVoucherRuntimeSummary } from "../features/runtime/workflow-runtime";
import { useWorkflowRuntimeSummary } from "../features/runtime/useWorkflowRuntimeSummary";

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
  const [activeTab, setActiveTab] = useState<VoucherTab>("all");
  const accessUser = useAccessUser();

  const visibleVouchers = useMemo(
    () => filterVouchersByTab(vouchers, activeTab),
    [vouchers, activeTab]
  );
  const batch = useVoucherBatch({ vouchers, onCompleted: () => refresh() });

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

  // ── Keyboard hotkeys (j/k/x/a/Enter) ──────────────────────────────────────
  function withVisibleVoucher(action: (voucher: Voucher) => void) {
    return (index: number) => {
      const voucher = visibleVouchers[index];
      if (voucher) action(voucher);
    };
  }

  const { activeIndex, setActiveIndex } = useListHotkeys({
    itemCount: visibleVouchers.length,
    isEnabled: !loading && !modalOpen && !batch.running,
    onToggle: withVisibleVoucher((voucher) => batch.toggleChecked(voucher.id)),
    onPrimary: withVisibleVoucher((voucher) => void runNextAction(voucher)),
    onOpen: withVisibleVoucher((voucher) => void handleSelect(voucher.id)),
  });
  const activeVoucherId = activeIndex >= 0 ? visibleVouchers[activeIndex]?.id ?? null : null;

  function handleTabChange(tab: VoucherTab) {
    setActiveTab(tab);
    setActiveIndex(-1);
    batch.clearChecked();
  }

  function handleRowClick(id: string) {
    const index = visibleVouchers.findIndex((voucher) => voucher.id === id);
    if (index >= 0) setActiveIndex(index);
    void handleSelect(id);
  }

  // ── Smart next action (a key): draft → 校验+审核, review_required → 过账 ────
  async function runValidateAndApprove(voucher: Voucher) {
    setUpdating(true);
    try {
      const result = await validateVoucher(voucher.id);
      setValidation(result);
      if (!result.valid) {
        const firstHint = buildValidationHints({ ...result, lines: voucher.lines })[0];
        toast.error(firstHint ? firstHint.problem : "借贷校验未通过，请检查分录");
        return;
      }
      await approveVoucher(voucher.id);
      await refresh(voucher.id);
      toast.success("借贷校验通过，凭证已审核");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUpdating(false);
    }
  }

  function confirmAndPost(voucher: Voucher) {
    // 过账影响总账和报表：键盘触发也必须二次确认
    Modal.confirm({
      title: "确认过账该凭证？",
      okText: "确认过账",
      cancelText: "取消",
      content: `凭证 ${formatVoucherCode(voucher.id)}（¥${voucherAmount(voucher).toFixed(2)}）过账后将正式记入总账，影响总账和财务报表。`,
      onOk: async () => {
        try {
          await postVoucher(voucher.id);
          await refresh(voucher.id);
          toast.success("凭证已过账，将影响总账和报表");
        } catch (err) {
          toast.error((err as Error).message);
        }
      },
    });
  }

  async function runNextAction(voucher: Voucher) {
    const action = resolveNextAction(voucher.status);
    if (action === "none") {
      toast.info("该凭证已过账，流程完结，无需操作");
      return;
    }
    await handleSelect(voucher.id);
    if (action === "validate_approve") {
      await runValidateAndApprove(voucher);
      return;
    }
    confirmAndPost(voucher);
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

  // ── 这张凭证走到哪了 ───────────────────────────────────────────────────────
  // 每一步都来自凭证真实字段 + 本次校验结论；「下一步」复用 resolveNextAction，
  // 与快捷键 a 是同一份判定（见 vouchers/voucher-flow.ts）。

  const voucherFlow = useMemo(() => buildVoucherFlow(detail, validation), [detail, validation]);
  const voucherNextStep = useMemo(() => buildVoucherNextStep(detail), [detail]);
  const reportPeriod = useMemo(() => buildVoucherReportPeriod(detail), [detail]);

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
    <>
      <VouchersShell
        header={(
          <>
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
          </>
        )}
        notice={navEventId ? (
          <span style={{ fontSize: 13, color: "#4d5d6c" }}>
            当前只看事项 <EntityLink kind="business_event" id={navEventId} /> 的关联<Term k="voucher">凭证</Term>。
          </span>
        ) : null}
        flow={(
          <VoucherFlowPanel
            flow={voucherFlow}
            title={buildVoucherFlowTitle(detail)}
            nextStep={voucherNextStep}
            reportPeriod={reportPeriod}
            busy={updating}
            onRunNextStep={() => {
              if (detail) void runNextAction(detail);
            }}
            onOpenReports={() => navigate("/reports")}
          />
        )}
        aside={(
          <VoucherRuntimeSection
            summary={runtimeSummary}
            busyActionKey={runtimeActionKey}
            voucherId={detail?.id ?? selectedId}
            onAction={(action) => void handleRuntimeAction(action)}
            onRuntimeChanged={() => void refresh(detail?.id ?? selectedId ?? undefined)}
            onRuntimeDetailChange={setRuntimeDetail}
          />
        )}
      >
        <VouchersWorkspace
          loading={loading}
          vouchers={vouchers}
          selectedId={selectedId}
          activeVoucherId={activeVoucherId}
          activeTab={activeTab}
          detail={detail}
          runtimeDetail={runtimeDetail}
          validation={validation}
          updating={updating}
          batch={batch}
          onTabChange={handleTabChange}
          onSelect={handleRowClick}
          onValidate={handleValidate}
          onApprove={handleApprove}
          onPost={handlePost}
          onSummaryUpdate={handleSummaryUpdate}
          onOpenEvent={(businessEventId) => navigate("/events", { state: { businessEventId } })}
          onOpenDocuments={(businessEventId) => navigate("/documents", { state: { businessEventId } })}
          onOpenTax={(businessEventId) => navigate("/tax", { state: { businessEventId } })}
          onOpenLedger={(voucherId, businessEventId) => navigate("/ledger", { state: { voucherId, businessEventId } })}
        />
      </VouchersShell>

      {/* 抽屉与弹窗不占首屏，放在外壳之外 */}
      <VouchersHelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
      <VoucherCreateModal
        open={modalOpen}
        templates={templates}
        initialEventId={navEventId ?? undefined}
        creating={creating}
        onSubmit={handleCreate}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}
