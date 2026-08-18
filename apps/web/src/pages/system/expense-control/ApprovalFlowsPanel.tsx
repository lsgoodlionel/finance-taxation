/**
 * 审批流配置（V13 残留 2）。
 *
 * ## 只做表单式配置，不做流程图编辑器
 *
 * 蓝图第五节明确排除了可视化编辑器——表单足够覆盖 V13 的范围
 *（串行多级 + 金额分级 + 驳回发起人 + 抄送），而编辑器是独立产品的工作量。
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
  InputNumber,
  Modal,
  Select,
  Skeleton,
  Space,
  Steps,
  Tag,
  Typography
} from "antd";
import { DeleteOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { toast } from "sonner";
import { errorMessage } from "../../../lib/errors";
import {
  createApprovalFlow,
  listApprovalFlows,
  type ApprovalDocumentType,
  type ApprovalFlow,
  type ApproverType
} from "../../../lib/api-expense-control";

const DOCUMENT_TYPE_LABELS: Record<ApprovalDocumentType, string> = {
  request: "申请单",
  advance: "借款 / 备用金",
  reimbursement: "报销单",
  payment: "付款单",
  contract: "合同"
};

const APPROVER_TYPE_LABELS: Record<ApproverType, string> = {
  role: "按角色",
  user: "指定到人",
  manager: "发起人的直属上级"
};

interface DraftStep {
  key: number;
  approverType: ApproverType;
  approverValue: string;
  minAmountYuan: number;
}

function describeStep(step: DraftStep): string {
  const who =
    step.approverType === "manager"
      ? "直属上级"
      : `${APPROVER_TYPE_LABELS[step.approverType]} ${step.approverValue || "（未指定）"}`;
  // 门槛是「达到即触发」——制度写「1 万以上需财务审批」，1 万整就该走财务。
  return step.minAmountYuan > 0 ? `${who}（≥ ${step.minAmountYuan} 元）` : `${who}（不限额）`;
}

export function ApprovalFlowsPanel() {
  const [flows, setFlows] = useState<ApprovalFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [documentType, setDocumentType] = useState<ApprovalDocumentType>("reimbursement");
  const [steps, setSteps] = useState<DraftStep[]>([
    { key: 1, approverType: "manager", approverValue: "", minAmountYuan: 0 }
  ]);

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
    const invalid = steps.find(
      (step) => step.approverType !== "manager" && step.approverValue.trim() === ""
    );
    if (invalid) {
      // 库上有 CHECK 兜底，但在这里拦能说人话：审批人为空的步骤会让
      // 任何人都批不了，单据永久卡死。
      toast.error("指定到角色或人的步骤必须填审批人");
      return;
    }

    setSubmitting(true);
    try {
      await createApprovalFlow({
        name: name.trim(),
        documentType,
        steps: steps.map((step) => ({
          approverType: step.approverType,
          approverValue: step.approverType === "manager" ? "" : step.approverValue.trim(),
          minAmountCents: Math.round(step.minAmountYuan * 100)
        }))
      });
      toast.success("流程已启用，同类单据的旧流程已自动停用");
      setCreating(false);
      setName("");
      setSteps([{ key: 1, approverType: "manager", approverValue: "", minAmountYuan: 0 }]);
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
              <Steps
                size="small"
                direction="horizontal"
                current={-1}
                items={flow.steps.map((step) => ({
                  title: `第 ${step.stepOrder} 步`,
                  description: describeStep({
                    key: step.stepOrder,
                    approverType: step.approverType,
                    approverValue: step.approverValue,
                    minAmountYuan: step.minAmountCents / 100
                  })
                }))}
              />
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

        <Typography.Title level={5}>审批步骤（按顺序串行）</Typography.Title>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
          金额门槛是「达到即触发」：写 10000 表示 1 万整也要走这一级。
          第一级建议留 0（不限额），否则小额单据会因为没有任何一级适用而提交失败。
        </Typography.Paragraph>

        <Space direction="vertical" style={{ width: "100%" }}>
          {steps.map((step, index) => (
            <Space key={step.key} align="start" wrap>
              <Tag>第 {index + 1} 步</Tag>
              <Select
                style={{ width: 180 }}
                value={step.approverType}
                onChange={(value) =>
                  setSteps((prev) =>
                    prev.map((item) =>
                      item.key === step.key ? { ...item, approverType: value } : item
                    )
                  )
                }
                options={Object.entries(APPROVER_TYPE_LABELS).map(([value, label]) => ({
                  value,
                  label
                }))}
              />
              {step.approverType !== "manager" && (
                <Input
                  style={{ width: 180 }}
                  placeholder={step.approverType === "role" ? "角色码，如 role-accountant" : "用户 id"}
                  value={step.approverValue}
                  onChange={(e) =>
                    setSteps((prev) =>
                      prev.map((item) =>
                        item.key === step.key ? { ...item, approverValue: e.target.value } : item
                      )
                    )
                  }
                />
              )}
              <InputNumber
                style={{ width: 150 }}
                min={0}
                precision={2}
                addonBefore="≥"
                addonAfter="元"
                value={step.minAmountYuan}
                onChange={(value) =>
                  setSteps((prev) =>
                    prev.map((item) =>
                      item.key === step.key ? { ...item, minAmountYuan: value ?? 0 } : item
                    )
                  )
                }
              />
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                disabled={steps.length === 1}
                onClick={() => setSteps((prev) => prev.filter((item) => item.key !== step.key))}
              />
            </Space>
          ))}

          <Button
            size="small"
            icon={<PlusOutlined />}
            onClick={() =>
              setSteps((prev) => [
                ...prev,
                {
                  key: Math.max(...prev.map((item) => item.key)) + 1,
                  approverType: "role",
                  approverValue: "",
                  minAmountYuan: 0
                }
              ])
            }
          >
            加一级
          </Button>
        </Space>
      </Modal>
    </div>
  );
}
