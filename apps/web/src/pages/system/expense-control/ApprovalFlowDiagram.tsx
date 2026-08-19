/**
 * 审批流程图预览（V14-B，只读）。
 *
 * ## 为什么只读
 *
 * V13 说过「表单足够，编辑器是独立产品的工作量」。V14 做可视化但**不做拖拽
 * 编辑**：可视化的价值主要在「看懂现有流程」——尤其是会签出现之后，
 * 「第 2 步是三个人都要批还是任一个批」在表格里要读两列才看得出来，
 * 在图上一眼就能看到。
 *
 * 而拖拽编辑的价值远小于它的复杂度：连线校验、环检测、撤销重做、
 * 与金额门槛的交互……那是一个产品，不是一个组件。编辑仍走表单。
 *
 * ## 会签画成并列分支
 *
 * 串行步骤是一条线，会签步骤是同一格里的多个人。这样「哪几步是并行的」
 * 从形状上就能看出来，不用读文字。
 */

import React from "react";
import { Space, Tag, Tooltip, Typography } from "antd";
import { ArrowRightOutlined, CheckCircleFilled, ClockCircleOutlined } from "@ant-design/icons";
import type { ApprovalFlowStep, ApproverType, StepMode } from "../../../lib/api-expense-control";

const APPROVER_TYPE_LABELS: Record<ApproverType, string> = {
  role: "角色",
  user: "指定",
  manager: "直属上级"
};

const MODE_META: Record<StepMode, { label: string; color: string; hint: string }> = {
  all: { label: "会签", color: "purple", hint: "这一步的每个人都要批准，任一人驳回即整单驳回" },
  any: { label: "或签", color: "cyan", hint: "这一步任一人批准即可推进" }
};

function describeApprover(approver: { approverType: ApproverType; approverValue: string }): string {
  if (approver.approverType === "manager") return "发起人的直属上级";
  return `${APPROVER_TYPE_LABELS[approver.approverType]}：${approver.approverValue || "（未指定）"}`;
}

export interface ApprovalFlowDiagramProps {
  steps: readonly ApprovalFlowStep[];
  /**
   * 当前进行到哪一步。传 `null` 表示这是流程定义的预览，不是某张单据的进度。
   *
   * **区分这两件事很重要**：配置页看的是「流程长什么样」，
   * 单据详情看的是「这张单走到哪了」。同一个图，两种读法。
   */
  currentStepOrder?: number | null;
  /** 某张单据上各步骤的表态。仅在看单据进度时传。 */
  participantStatusByStep?: ReadonlyMap<number, { done: number; total: number }>;
}

export function ApprovalFlowDiagram({
  steps,
  currentStepOrder = null,
  participantStatusByStep
}: ApprovalFlowDiagramProps) {
  if (steps.length === 0) {
    return <Typography.Text type="secondary">这条流程没有任何步骤</Typography.Text>;
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 4,
        overflowX: "auto",
        paddingBottom: 8
      }}
    >
      {steps.map((step, index) => {
        const isCurrent = currentStepOrder === step.stepOrder;
        const isPast = currentStepOrder !== null && step.stepOrder < currentStepOrder;
        const progress = participantStatusByStep?.get(step.stepOrder);
        // 一个审批人时会签与或签行为相同，标签会误导——不标。
        const showMode = step.approvers.length > 1;

        return (
          <React.Fragment key={step.stepOrder}>
            {index > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  color: "#bfbfbf",
                  flexShrink: 0
                }}
                aria-hidden
              >
                <ArrowRightOutlined />
              </div>
            )}

            <div
              style={{
                minWidth: 180,
                flexShrink: 0,
                border: `1px solid ${isCurrent ? "#1677ff" : "#f0f0f0"}`,
                borderRadius: 8,
                padding: "10px 12px",
                background: isCurrent ? "#e6f4ff" : isPast ? "#f6ffed" : "#fff"
              }}
            >
              <Space size={4} style={{ marginBottom: 6 }} wrap>
                <Typography.Text strong>第 {step.stepOrder} 步</Typography.Text>
                {showMode && (
                  <Tooltip title={MODE_META[step.mode].hint}>
                    <Tag color={MODE_META[step.mode].color}>{MODE_META[step.mode].label}</Tag>
                  </Tooltip>
                )}
                {isPast && <CheckCircleFilled style={{ color: "#52c41a" }} />}
                {isCurrent && <ClockCircleOutlined style={{ color: "#1677ff" }} />}
              </Space>

              {/* 会签的多个人竖着并列——「哪几步是并行的」从形状上就看得出来 */}
              <div style={{ display: "grid", gap: 3 }}>
                {step.approvers.map((approver, approverIndex) => (
                  <Typography.Text
                    key={`${approver.approverType}-${approver.approverValue}-${approverIndex}`}
                    style={{ fontSize: 12 }}
                  >
                    · {describeApprover(approver)}
                  </Typography.Text>
                ))}
              </div>

              <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 6 }}>
                {/* 门槛是「达到即触发」——制度写「1 万以上」，1 万整就该走这一级 */}
                {step.minAmountCents > 0
                  ? `≥ ${(step.minAmountCents / 100).toLocaleString("zh-CN")} 元触发`
                  : "不限额，总要走"}
              </Typography.Text>

              {progress !== undefined && (
                <Typography.Text
                  type={progress.done === progress.total ? "success" : "warning"}
                  style={{ fontSize: 12, display: "block", marginTop: 4 }}
                >
                  已批 {progress.done} / {progress.total}
                </Typography.Text>
              )}
            </div>
          </React.Fragment>
        );
      })}

      <div style={{ display: "flex", alignItems: "center", color: "#bfbfbf" }} aria-hidden>
        <ArrowRightOutlined />
      </div>
      <div
        style={{
          minWidth: 90,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px dashed #d9d9d9",
          borderRadius: 8,
          padding: "10px 12px"
        }}
      >
        <Typography.Text type="secondary">通过</Typography.Text>
      </div>
    </div>
  );
}
