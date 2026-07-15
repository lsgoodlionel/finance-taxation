import { Tag, Typography } from "antd";
import type { VoucherStatus } from "@finance-taxation/domain-model";
import { VOUCHER_STATUS_LABELS, useI18n } from "../../lib/i18n";
import { NEXT_ACTION_LABELS, resolveNextAction } from "./voucher-actions";

const { Text } = Typography;

const FLOW_STAGES: readonly VoucherStatus[] = ["draft", "review_required", "posted"];

const STAGE_COLOR: Record<VoucherStatus, string> = {
  draft: "default",
  review_required: "warning",
  posted: "success",
};

interface VoucherStatusFlowProps {
  status: VoucherStatus;
}

/**
 * V7 L2 状态流转可视：Tag 流（草稿 → 待审核 → 已过账），
 * 当前阶段高亮，下一步动作与 a 键智能动作保持一致。
 */
export function VoucherStatusFlow({ status }: VoucherStatusFlowProps) {
  const { t } = useI18n();
  const nextAction = resolveNextAction(status);
  const currentStageIndex = FLOW_STAGES.indexOf(status);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "nowrap" }}>
        {FLOW_STAGES.map((stage, index) => (
          <span key={stage} style={{ display: "inline-flex", alignItems: "center" }}>
            {index > 0 && <span style={{ fontSize: 10, color: "#cbd5e1", margin: "0 2px" }}>→</span>}
            {stage === status ? (
              <Tag color={STAGE_COLOR[stage]} style={{ fontSize: 11, margin: 0 }}>
                {t(VOUCHER_STATUS_LABELS, stage)}
              </Tag>
            ) : (
              <span style={{ fontSize: 11, color: index < currentStageIndex ? "#94a3b8" : "#cbd5e1" }}>
                {t(VOUCHER_STATUS_LABELS, stage)}
              </span>
            )}
          </span>
        ))}
      </div>
      <Text
        style={{
          fontSize: 11,
          color: nextAction === "none" ? "#94a3b8" : "#2563eb",
          display: "inline-block",
          marginTop: 2,
        }}
      >
        {nextAction === "none" ? NEXT_ACTION_LABELS.none : `下一步：${NEXT_ACTION_LABELS[nextAction]}`}
      </Text>
    </div>
  );
}
