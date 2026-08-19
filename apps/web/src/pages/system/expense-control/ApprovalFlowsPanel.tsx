/**
 * 审批流配置（V13 残留 2）。
 *
 * ## 表单配置 + 只读流程图
 *
 * V13 排除了可视化编辑器，V14-B 加了**只读预览**（`ApprovalFlowDiagram`）
 * 但仍然不做拖拽编辑。会签出现之后「第 2 步是三个人都要批还是任一个批」
 * 在文字里要读两处才看得出来，在图上一眼就能看到——可视化的价值在这里，
 * 而不在拖拽。
 *
 * ## 会签 / 或签（V14-B）
 *
 * 一个步骤可以有多个审批人，`mode` 决定都要批（会签）还是任一批（或签）。
 * 只有一个审批人时两者行为相同，界面上因此不显示模式标签——显示会误导。
 *
 * ## 新增即停用旧的
 *
 * 一种单据同时只能有一条启用流程（库上是排他约束）。所以这里没有「编辑」——
 * 改流程就是**新建一条**，旧的自动停用。这不是偷懒：历史审批实例引用着旧流程，
 * 就地改会让「这单当年是谁批的」对不上。界面上要把这一点说清楚。
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Skeleton,
  Space,
  Tag,
  Typography
} from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { toast } from "sonner";
import { errorMessage } from "../../../lib/errors";
import {
  createApprovalFlow,
  listApprovalFlows,
  type ApprovalDocumentType,
  type ApprovalFlow,
  type ApprovalFlowStep
} from "../../../lib/api-expense-control";
import { ApprovalFlowDiagram } from "./ApprovalFlowDiagram";
// 草稿的类型定义跟着编辑器走——两处各定义一份迟早漂移，
// 而漂移的表现是「拖完保存下去少了一个字段」。
import { ApprovalFlowEditor, type DraftStep } from "./ApprovalFlowEditor";

const DOCUMENT_TYPE_LABELS: Record<ApprovalDocumentType, string> = {
  request: "申请单",
  advance: "借款 / 备用金",
  reimbursement: "报销单",
  payment: "付款单",
  contract: "合同"
};

function newStep(key: number): DraftStep {
  return {
    key,
    mode: "all",
    minAmountYuan: 0,
    approvers: [{ key: 1, approverType: "role", approverValue: "" }]
  };
}

/** 草稿转成流程图组件要的形状，让新建时也能预览。 */
function draftToSteps(steps: readonly DraftStep[]): ApprovalFlowStep[] {
  return steps.map((step, index) => ({
    stepOrder: index + 1,
    minAmountCents: Math.round(step.minAmountYuan * 100),
    mode: step.mode,
    approvers: step.approvers.map((approver) => ({
      stepOrder: index + 1,
      approverType: approver.approverType,
      approverValue: approver.approverType === "manager" ? "" : approver.approverValue.trim(),
      minAmountCents: Math.round(step.minAmountYuan * 100)
    }))
  }));
}

export function ApprovalFlowsPanel() {
  const [flows, setFlows] = useState<ApprovalFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [documentType, setDocumentType] = useState<ApprovalDocumentType>("reimbursement");
  const [steps, setSteps] = useState<DraftStep[]>([newStep(1)]);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await listApprovalFlows();
      setFlows(data.items);
    } catch (error) {
      setLoadError(errorMessage(error, "审批流加载失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleCreate = async () => {
    if (name.trim() === "") {
      toast.error("请填写流程名称");
      return;
    }
    // 库上有 CHECK 兜底，但在这里拦能说人话：审批人为空的步骤会让
    // 任何人都批不了，单据永久卡死。
    const emptyStep = steps.findIndex((step) => step.approvers.length === 0);
    if (emptyStep >= 0) {
      toast.error(`第 ${emptyStep + 1} 步没有审批人`);
      return;
    }
    for (const [index, step] of steps.entries()) {
      const invalid = step.approvers.find(
        (approver) => approver.approverType !== "manager" && approver.approverValue.trim() === ""
      );
      if (invalid) {
        toast.error(`第 ${index + 1} 步：指定到角色或人的审批人必须填具体对象`);
        return;
      }
    }

    setSubmitting(true);
    try {
      await createApprovalFlow({
        name: name.trim(),
        documentType,
        steps: steps.map((step) => ({
          mode: step.mode,
          minAmountCents: Math.round(step.minAmountYuan * 100),
          approvers: step.approvers.map((approver) => ({
            approverType: approver.approverType,
            approverValue: approver.approverType === "manager" ? "" : approver.approverValue.trim()
          }))
        }))
      });
      toast.success("流程已启用，同类单据的旧流程已自动停用");
      setCreating(false);
      setName("");
      setSteps([newStep(1)]);
      await reload();
    } catch (error) {
      toast.error(errorMessage(error, "保存失败"));
    } finally {
      setSubmitting(false);
    }
  };

  const activeFlows = flows.filter((flow) => flow.isActive);
  const retiredFlows = flows.filter((flow) => !flow.isActive);

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ReloadOutlined />} onClick={() => void reload()}>
          刷新
        </Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
          新建流程
        </Button>
      </Space>

      {loadError && (
        <Alert
          type="error"
          showIcon
          message="加载失败"
          description={loadError}
          style={{ marginBottom: 16 }}
        />
      )}

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="一种单据同时只有一条启用流程"
        description="改流程就是新建一条，旧的自动停用并保留——历史审批实例引用着它，就地改会让「这单当年是谁批的」对不上。"
      />

      {loading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : activeFlows.length === 0 ? (
        <Empty description="还没有审批流程。没有流程，单据提交会被拒绝。">
          <Button type="primary" onClick={() => setCreating(true)}>
            配第一条流程
          </Button>
        </Empty>
      ) : (
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          {activeFlows.map((flow) => (
            <Card
              key={flow.id}
              size="small"
              title={
                <Space>
                  <Tag color="blue">{DOCUMENT_TYPE_LABELS[flow.documentType]}</Tag>
                  <span>{flow.name}</span>
                  <Tag color="green">启用中</Tag>
                </Space>
              }
            >
              <ApprovalFlowDiagram steps={flow.steps} />
            </Card>
          ))}

          {retiredFlows.length > 0 && (
            <Card size="small" title="已停用的流程（保留供历史单据追溯）">
              {retiredFlows.map((flow) => (
                <Typography.Paragraph key={flow.id} type="secondary" style={{ marginBottom: 4 }}>
                  {DOCUMENT_TYPE_LABELS[flow.documentType]} · {flow.name} · {flow.steps.length} 步
                </Typography.Paragraph>
              ))}
            </Card>
          )}
        </Space>
      )}

      <Modal
        open={creating}
        title="新建审批流程"
        width={640}
        okText="启用"
        cancelText="取消"
        confirmLoading={submitting}
        onCancel={() => setCreating(false)}
        onOk={() => void handleCreate()}
      >
        <Form layout="vertical">
          <Form.Item label="流程名称" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：报销审批（2026 版）"
              maxLength={40}
            />
          </Form.Item>

          <Form.Item label="适用单据">
            <Select
              value={documentType}
              onChange={setDocumentType}
              options={Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => ({
                value,
                label
              }))}
            />
          </Form.Item>
        </Form>

        <Typography.Title level={5}>审批步骤</Typography.Title>
        <ApprovalFlowEditor steps={steps} onChange={setSteps} />

        <Typography.Title level={5} style={{ marginTop: 20 }}>
          预览
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          启用前先看一眼形状。会签步骤的多个审批人在同一格里并列，
          「哪几步是并行的」不用读文字就看得出来。
        </Typography.Paragraph>
        <ApprovalFlowDiagram steps={draftToSteps(steps)} />
      </Modal>
    </div>
  );
}
