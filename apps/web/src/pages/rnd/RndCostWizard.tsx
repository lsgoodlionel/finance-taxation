import { useState } from "react";
import {
  Modal, Steps, Button, Space, Form, Select, Input, DatePicker,
  Table, Typography, Alert, Tag, Descriptions, Row, Col, Statistic,
} from "antd";
import {
  CheckCircleOutlined, ExperimentOutlined, CalculatorOutlined,
  FileTextOutlined, SaveOutlined,
} from "@ant-design/icons";
import { toast } from "sonner";
import type { RndProjectDetail } from "../../lib/api";
import { createRndCostLine } from "../../lib/api";
import { COST_TYPE_LABELS, ACCOUNTING_TREATMENT_LABELS, useI18n } from "../../lib/i18n";
import type { RndCostLineType, RndAccountingTreatment } from "@finance-taxation/domain-model";

const { Text, Title } = Typography;

const COST_CATEGORIES: { value: RndCostLineType; label: string; description: string }[] = [
  { value: "payroll",   label: "人员费用",  description: "研发人员工资、奖金、社保" },
  { value: "materials", label: "材料费用",  description: "直接消耗的原材料、辅料" },
  { value: "equipment", label: "设备折旧",  description: "研发专用设备的折旧和租赁" },
  { value: "software",  label: "软件许可",  description: "研发用软件购买和许可费" },
  { value: "service",   label: "外包服务",  description: "委托外部机构研发的费用" },
  { value: "other",     label: "其他费用",  description: "满足加计扣除条件的其他合理费用" },
];

interface CostEntry {
  costType: RndCostLineType;
  accountingTreatment: RndAccountingTreatment;
  amount: string;
  occurredOn: string;
  notes: string;
}

interface RndCostWizardProps {
  open: boolean;
  project: RndProjectDetail | null;
  onClose: () => void;
  onComplete: () => void;
}

export function RndCostWizard({ open, project, onClose, onComplete }: RndCostWizardProps) {
  const { t } = useI18n();
  const [currentStep, setCurrentStep] = useState(0);
  const [costEntries, setCostEntries] = useState<CostEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<CostEntry>();

  if (!project) return null;
  const safeProject = project;

  const totalExpensed    = costEntries.filter(e => e.accountingTreatment === "expensed").reduce((s, e) => s + parseFloat(e.amount || "0"), 0);
  const totalCapitalized = costEntries.filter(e => e.accountingTreatment === "capitalized").reduce((s, e) => s + parseFloat(e.amount || "0"), 0);
  const totalAmount      = totalExpensed + totalCapitalized;
  const eligibleBase     = totalExpensed + totalCapitalized * 0.60; // approx eligible portion
  const estimatedDeduction = eligibleBase * 0.75;

  function addEntry() {
    void form.validateFields().then((values) => {
      setCostEntries(prev => [...prev, values]);
      form.resetFields();
      toast.success("费用条目已添加");
    });
  }

  function removeEntry(idx: number) {
    setCostEntries(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit() {
    if (costEntries.length === 0) {
      toast.error("请至少添加一条费用记录");
      return;
    }
    setSubmitting(true);
    try {
      for (const entry of costEntries) {
        await createRndCostLine(safeProject.id, {
          costType: entry.costType,
          accountingTreatment: entry.accountingTreatment,
          amount: entry.amount,
          occurredOn: entry.occurredOn,
          notes: entry.notes,
        });
      }
      toast.success(`已归集 ${costEntries.length} 条费用，台账已更新`);
      setCostEntries([]);
      setCurrentStep(0);
      onComplete();
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const steps = [
    {
      title: "项目认定",
      icon: <ExperimentOutlined />,
      content: (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Alert
            type="info"
            showIcon
            message="项目合规性确认"
            description="请确认研发项目满足以下高新技术企业研发费用加计扣除条件，再进行费用归集。"
          />
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="项目名称">{project.name}</Descriptions.Item>
            <Descriptions.Item label="项目编号">{project.code}</Descriptions.Item>
            <Descriptions.Item label="开始日期">{project.startedOn}</Descriptions.Item>
            <Descriptions.Item label="资本化政策">
              <Tag color="blue">{project.capitalizationPolicy}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="项目状态">
              <Tag color={project.status === "active" ? "success" : "default"}>{project.status}</Tag>
            </Descriptions.Item>
          </Descriptions>
          <Alert
            type="success"
            showIcon
            message="合规性清单"
            description={
              <ul style={{ margin: "6px 0 0 16px", padding: 0, lineHeight: 1.9, fontSize: 13 }}>
                <li>✅ 该项目在公司研发项目立项清单中已登记</li>
                <li>✅ 研发活动符合科技部《研究开发费用归集范围》规定</li>
                <li>✅ 开展的研究属于未掌握的新技术、新工艺或新产品</li>
                <li>✅ 费用已按会计准则分项归集</li>
              </ul>
            }
          />
          {project.policyReview.conflicts.length > 0 && (
            <Alert
              type="warning"
              showIcon
              message="政策合规风险提示"
              description={
                <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
                  {project.policyReview.conflicts.map(c => <li key={c}>{c}</li>)}
                </ul>
              }
            />
          )}
        </Space>
      ),
    },
    {
      title: "费用归集",
      icon: <CalculatorOutlined />,
      content: (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Alert
            type="info"
            showIcon
            message="按费用类别录入本期研发费用。费用化部分直接进入损益，资本化部分形成无形资产分期摊销。"
          />
          <Form form={form} layout="vertical" size="small">
            <Row gutter={[12, 0]}>
              <Col span={8}>
                <Form.Item name="costType" label="费用类别" rules={[{ required: true }]}>
                  <Select placeholder="选择类别">
                    {COST_CATEGORIES.map(c => (
                      <Select.Option key={c.value} value={c.value}>
                        {c.label}
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
              <Col span={7}>
                <Form.Item name="accountingTreatment" label="会计处理" rules={[{ required: true }]}>
                  <Select placeholder="费用化/资本化">
                    <Select.Option value="expensed">费用化</Select.Option>
                    <Select.Option value="capitalized">资本化</Select.Option>
                  </Select>
                </Form.Item>
              </Col>
              <Col span={9}>
                <Form.Item name="amount" label="金额（元）" rules={[
                  { required: true },
                  { pattern: /^\d+(\.\d{1,2})?$/, message: "有效金额" },
                ]}>
                  <Input prefix="¥" placeholder="0.00" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="occurredOn" label="发生日期" rules={[{ required: true }]}>
                  <Input type="date" />
                </Form.Item>
              </Col>
              <Col span={16}>
                <Form.Item name="notes" label="备注">
                  <Input placeholder="费用说明（可选）" />
                </Form.Item>
              </Col>
            </Row>
            <Button size="small" type="dashed" onClick={addEntry} block>+ 添加费用条目</Button>
          </Form>

          {costEntries.length > 0 && (
            <Table
              size="small"
              dataSource={costEntries.map((e, i) => ({ ...e, key: i }))}
              pagination={false}
              columns={[
                { title: "类别", dataIndex: "costType", render: (v: RndCostLineType) => t(COST_TYPE_LABELS, v) },
                { title: "处理", dataIndex: "accountingTreatment", render: (v: RndAccountingTreatment) => t(ACCOUNTING_TREATMENT_LABELS, v) },
                { title: "金额", dataIndex: "amount", align: "right" as const, render: (v: string) => `¥${parseFloat(v).toLocaleString()}` },
                { title: "日期", dataIndex: "occurredOn" },
                {
                  title: "", key: "action", width: 50,
                  render: (_: unknown, __: unknown, idx: number) => (
                    <Button size="small" type="text" danger onClick={() => removeEntry(idx)}>删除</Button>
                  ),
                },
              ]}
            />
          )}
        </Space>
      ),
    },
    {
      title: "分摊计算",
      icon: <FileTextOutlined />,
      content: (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Alert
            type="info"
            showIcon
            message="以下为本次归集费用的加计扣除测算结果，确认无误后点击「生成台账」。"
          />
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <Statistic title="费用化金额" value={totalExpensed.toFixed(2)} prefix="¥" valueStyle={{ color: "#2563eb" }} />
            </Col>
            <Col span={12}>
              <Statistic title="资本化金额" value={totalCapitalized.toFixed(2)} prefix="¥" valueStyle={{ color: "#7c3aed" }} />
            </Col>
            <Col span={12}>
              <Statistic title="合计研发投入" value={totalAmount.toFixed(2)} prefix="¥" />
            </Col>
            <Col span={12}>
              <Statistic title="加计扣除基数（估算）" value={eligibleBase.toFixed(2)} prefix="¥" valueStyle={{ color: "#16a34a" }} />
            </Col>
          </Row>
          <Alert
            type="success"
            showIcon
            message={`按 75% 加计扣除率，本次预计可额外扣除 ¥${estimatedDeduction.toFixed(2)}`}
            description="注：最终加计扣除金额以年度汇算清缴时经税务师核定的数额为准。"
          />
          {project.policyReview.guidance.length > 0 && (
            <Alert
              type="warning"
              showIcon
              message="政策建议"
              description={
                <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
                  {project.policyReview.guidance.map(g => <li key={g}>{g}</li>)}
                </ul>
              }
            />
          )}
        </Space>
      ),
    },
    {
      title: "台账生成",
      icon: <SaveOutlined />,
      content: (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Alert
            type="success"
            showIcon
            icon={<CheckCircleOutlined />}
            message="准备生成台账"
            description="点击「完成归集」将把以上费用写入研发辅助账，并同步更新加计扣除基数，可在税务中心查看。"
          />
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="项目" span={2}>{project.name}</Descriptions.Item>
            <Descriptions.Item label="归集条数">{costEntries.length}</Descriptions.Item>
            <Descriptions.Item label="合计金额">¥{totalAmount.toFixed(2)}</Descriptions.Item>
            <Descriptions.Item label="费用化">¥{totalExpensed.toFixed(2)}</Descriptions.Item>
            <Descriptions.Item label="资本化">¥{totalCapitalized.toFixed(2)}</Descriptions.Item>
            <Descriptions.Item label="预计加计扣除" span={2}>
              <Text strong style={{ color: "#16a34a" }}>¥{estimatedDeduction.toFixed(2)}</Text>
            </Descriptions.Item>
          </Descriptions>
          <Alert
            type="info"
            message="台账生成后将自动推送到税务中心「企业所得税」申报材料中，年度汇算清缴时直接引用。"
          />
        </Space>
      ),
    },
  ];

  return (
    <Modal
      title={
        <Space>
          <ExperimentOutlined />
          <span>研发费用归集向导 — {project.name}</span>
        </Space>
      }
      open={open}
      onCancel={() => {
        setCostEntries([]);
        setCurrentStep(0);
        onClose();
      }}
      width={700}
      footer={
        <Space style={{ justifyContent: "flex-end", width: "100%" }}>
          {currentStep > 0 && (
            <Button onClick={() => setCurrentStep(s => s - 1)}>上一步</Button>
          )}
          {currentStep < steps.length - 1 && (
            <Button type="primary" onClick={() => setCurrentStep(s => s + 1)}>下一步</Button>
          )}
          {currentStep === steps.length - 1 && (
            <Button type="primary" loading={submitting} onClick={() => void handleSubmit()}>
              完成归集
            </Button>
          )}
          <Button onClick={() => { setCostEntries([]); setCurrentStep(0); onClose(); }}>取消</Button>
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
