import React from "react";
import { Term } from "../../components/ui/Term";
import type { WorkflowRunDetail } from "../../lib/api";
import { WorkflowRuntimePanel } from "../../features/runtime/WorkflowRuntimePanel";
import { WorkflowRuntimeCard } from "../../components/workflow/WorkflowRuntimeCard";
import type { WorkflowRuntimeSummary } from "../../features/runtime/workflow-runtime";
import { needsRuntimeAttention } from "../../features/runtime/runtime-attention";

/**
 * 凭证页的运行态/授权态——原来是两块，现在合成一块。
 *
 * 改造前 /vouchers 同屏摆了两个语义重复的区块：
 * - WorkflowRuntimePanel「凭证运行态与授权态」：整条凭证链的执行态/授权态概览，
 *   带统计和「重新校验凭证」修复动作；
 * - WorkflowRuntimeCard「凭证运行态 / 授权态」：选中这一张凭证的运行记录明细，
 *   带重试/取消命令与人工补偿登记。
 * 两块标题几乎一样、讲的都是「运行态与授权态」，用户根本分不清该看哪个。
 *
 * 合并方式是「概览 + 明细」而不是二选一：Card 提供的重试、取消、补偿登记是
 * Panel 没有的能力，而且它同时负责把 WorkflowRunDetail 回传给凭证详情
 * （阻塞原因、补偿记录都靠它），删掉任何一个都会丢功能。
 * 所以：Panel 当这块的正文，Card 收进「执行明细」折叠区，始终挂载、按需展开。
 *
 * 是否占据视线由 needsRuntimeAttention 决定：正常时整块折起来，与 /tax 同口径。
 */

interface VoucherRuntimeSectionProps {
  summary: WorkflowRuntimeSummary;
  busyActionKey: string | null;
  /** 当前选中的凭证 id，Card 据此拉这张凭证的运行记录。 */
  voucherId: string | null;
  onAction: (action: NonNullable<WorkflowRuntimeSummary["actions"]>[number]) => void;
  onRuntimeChanged: () => void;
  onRuntimeDetailChange: (detail: WorkflowRunDetail | null) => void;
}

const DETAILS_SUMMARY_STYLE: React.CSSProperties = {
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  color: "#4d5d6c"
};

const RUNTIME_TITLE = "凭证运行态与授权态";

export function VoucherRuntimeSection({
  summary,
  busyActionKey,
  voucherId,
  onAction,
  onRuntimeChanged,
  onRuntimeDetailChange
}: VoucherRuntimeSectionProps) {
  const attention = needsRuntimeAttention(summary);

  const runtimeCard = (
    <WorkflowRuntimeCard
      title="这张凭证的执行明细"
      resourceType="voucher"
      resourceId={voucherId}
      emptyHint="选择凭证后，可查看该凭证的运行状态、授权状态、重试与补偿信息。"
      onChanged={onRuntimeChanged}
      onDetailChange={onRuntimeDetailChange}
    />
  );

  const runtimePanel = (
    <WorkflowRuntimePanel
      title={RUNTIME_TITLE}
      summary={summary}
      onAction={onAction}
      busyActionKey={busyActionKey}
    />
  );

  if (attention) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        {runtimePanel}
        <details className="v3-section-shell" data-tone="muted" style={{ padding: "12px 16px" }}>
          <summary style={DETAILS_SUMMARY_STYLE}>
            {/* summary 本身是可聚焦的开合控件，术语只能用非交互变体，避免焦点嵌套 */}
            这张<Term k="voucher" interactive={false}>凭证</Term>的执行明细（重试、取消、人工补偿）
          </summary>
          <div style={{ marginTop: 12 }}>{runtimeCard}</div>
        </details>
      </div>
    );
  }

  return (
    <details className="v3-section-shell" data-tone="muted" style={{ padding: "12px 16px" }}>
      <summary style={DETAILS_SUMMARY_STYLE}>运行与授权状态（当前无异常）</summary>
      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
        {runtimePanel}
        {runtimeCard}
      </div>
    </details>
  );
}
