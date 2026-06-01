import { useState } from "react";
import { Modal, Steps, Button, Space, Checkbox, Alert, Descriptions, Tag, Typography, Input } from "antd";
import {
  CheckSquareOutlined, AlertOutlined, CheckCircleOutlined, FileProtectOutlined,
} from "@ant-design/icons";
import type { Contract } from "@finance-taxation/domain-model";

const { Text } = Typography;

const STATUS_LABELS: Record<string, string> = {
  fulfilled: "已履行", terminated: "已终止",
};

interface ChecklistItem { id: string; label: string; required: boolean }

const FULFILLMENT_CHECKLIST: ChecklistItem[] = [
  { id: "payment",  label: "款项已全额支付或收款",          required: true  },
  { id: "delivery", label: "货物/服务已按合同约定交付",      required: true  },
  { id: "accept",   label: "验收手续已完成并签字",           required: true  },
  { id: "invoice",  label: "发票已开具且已入账",             required: true  },
  { id: "voucher",  label: "会计凭证已过账",                 required: false },
  { id: "archive",  label: "原始凭证及合同副本已归档",       required: false },
];

interface ContractCloseWizardProps {
  contract: Contract | null;
  closeStatus: "fulfilled" | "terminated";
  open: boolean;
  onClose: () => void;
  onConfirm: (status: "fulfilled" | "terminated", notes: string) => Promise<void>;
}

export function ContractCloseWizard({ contract, closeStatus, open, onClose, onConfirm }: ContractCloseWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!contract) return null;
  const safeContract = contract;

  const requiredItems = FULFILLMENT_CHECKLIST.filter(i => i.required);
  const allRequired   = requiredItems.every(i => checked.has(i.id));

  function toggleCheck(id: string) {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function reset() {
    setCurrentStep(0);
    setChecked(new Set());
    setNotes("");
    setSubmitting(false);
  }

  async function handleConfirm() {
    setSubmitting(true);
    try {
      await onConfirm(closeStatus, notes);
      reset();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  const steps = [
    {
      title: "履行核查",
      icon: <CheckSquareOutlined />,
      content: (
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Alert
            type={closeStatus === "terminated" ? "warning" : "info"}
            showIcon
            message={
              closeStatus === "terminated"
                ? "合同终止前，请确认以下事项均已妥善处理"
                : "合同关闭前，请核查以下履行清单"
            }
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {FULFILLMENT_CHECKLIST.map(item => (
              <div
                key={item.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 12px", borderRadius: 8,
                  background: checked.has(item.id) ? "rgba(22,163,74,0.05)" : "#f8fafc",
                  border: `1px solid ${checked.has(item.id) ? "rgba(22,163,74,0.2)" : "#e2e8f0"}`,
                  cursor: "pointer",
                }}
                onClick={() => toggleCheck(item.id)}
              >
                <Checkbox checked={checked.has(item.id)} onChange={() => toggleCheck(item.id)} />
                <Text style={{ fontSize: 13, flex: 1 }}>{item.label}</Text>
                {item.required && <Tag color="error" style={{ fontSize: 10 }}>必须</Tag>}
              </div>
            ))}
          </div>
          {!allRequired && (
            <Alert type="warning" showIcon message="请勾选全部必须项后才能进入下一步" />
          )}
        </Space>
      ),
      nextDisabled: !allRequired,
    },
    {
      title: "风险确认",
      icon: <AlertOutlined />,
      content: (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Alert
            type={closeStatus === "terminated" ? "error" : "success"}
            showIcon
            message={closeStatus === "terminated" ? "终止合同将不可撤销，请确认" : "履行完成确认"}
          />
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="合同">{safeContract.title}</Descriptions.Item>
            <Descriptions.Item label="交易方">{safeContract.counterpartyName}</Descriptions.Item>
            <Descriptions.Item label="金额">¥{safeContract.amount.toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="操作">
              <Tag color={closeStatus === "fulfilled" ? "success" : "error"}>
                {STATUS_LABELS[closeStatus]}
              </Tag>
            </Descriptions.Item>
          </Descriptions>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              处置说明（可选）
            </Text>
            <Input.TextArea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={closeStatus === "terminated" ? "请说明终止原因" : "补充履行完成备注"}
              rows={3}
              style={{ marginTop: 6 }}
            />
          </div>
        </Space>
      ),
      nextDisabled: false,
    },
    {
      title: "归档完成",
      icon: <CheckCircleOutlined />,
      content: (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Alert
            type="success"
            showIcon
            icon={<FileProtectOutlined />}
            message="准备完成合同关闭"
            description="确认后合同将被标记为关闭状态，相关事项和凭证状态将随之更新。"
          />
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="合同名称" span={2}>{safeContract.title}</Descriptions.Item>
            <Descriptions.Item label="关闭状态">
              <Tag color={closeStatus === "fulfilled" ? "success" : "error"}>
                {STATUS_LABELS[closeStatus]}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="已完成清单项">
              {checked.size} / {FULFILLMENT_CHECKLIST.length}
            </Descriptions.Item>
            {notes && <Descriptions.Item label="备注" span={2}>{notes}</Descriptions.Item>}
          </Descriptions>
          <Alert
            type="info"
            message="关闭后可在合同列表筛选「已履行/已终止」查看历史合同，不影响已过账凭证数据。"
          />
        </Space>
      ),
      nextDisabled: false,
    },
  ];

  return (
    <Modal
      title={
        <Space>
          <FileProtectOutlined />
          <span>合同关闭向导 — {closeStatus === "fulfilled" ? "履约完成" : "合同终止"}</span>
        </Space>
      }
      open={open}
      onCancel={() => { reset(); onClose(); }}
      width={600}
      footer={
        <Space style={{ justifyContent: "flex-end", width: "100%" }}>
          {currentStep > 0 && (
            <Button onClick={() => setCurrentStep(s => s - 1)}>上一步</Button>
          )}
          {currentStep < steps.length - 1 && (
            <Button
              type="primary"
              disabled={steps[currentStep]?.nextDisabled}
              onClick={() => setCurrentStep(s => s + 1)}
            >
              下一步
            </Button>
          )}
          {currentStep === steps.length - 1 && (
            <Button
              type="primary"
              danger={closeStatus === "terminated"}
              loading={submitting}
              onClick={() => void handleConfirm()}
            >
              {closeStatus === "terminated" ? "确认终止" : "确认完成"}
            </Button>
          )}
          <Button onClick={() => { reset(); onClose(); }}>取消</Button>
        </Space>
      }
    >
      <Steps
        current={currentStep}
        size="small"
        style={{ marginBottom: 24 }}
        items={steps.map(s => ({ title: s.title, icon: s.icon }))}
      />
      {steps[currentStep]?.content}
    </Modal>
  );
}
