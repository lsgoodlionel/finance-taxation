import { useState } from "react";
import {
  Modal, Steps, Button, Space, Table, Typography, Alert, Descriptions,
  Statistic, Row, Col, Tag, Input, Upload,
} from "antd";
import {
  CheckCircleOutlined, FileTextOutlined, AuditOutlined,
  SaveOutlined, UploadOutlined, CalculatorOutlined,
} from "@ant-design/icons";
import { toast } from "sonner";
import type { VatWorkingPaper, TaxFilingBatch } from "@finance-taxation/domain-model";
import {
  getVatWorkingPaper, submitTaxFilingBatch, reviewTaxFilingBatch,
} from "../../lib/api";

const { Text, Title } = Typography;

interface VatDeclarationWizardProps {
  open: boolean;
  filingPeriod: string;
  batch: TaxFilingBatch | null;
  onClose: () => void;
  onComplete: () => void;
}

export function VatDeclarationWizard({
  open, filingPeriod, batch, onClose, onComplete,
}: VatDeclarationWizardProps) {
  const [step, setStep] = useState(0);
  const [paper, setPaper] = useState<VatWorkingPaper | null>(null);
  const [loadingPaper, setLoadingPaper] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [taxAmount, setTaxAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function loadPaper() {
    if (paper) return;
    setLoadingPaper(true);
    try {
      const result = await getVatWorkingPaper(filingPeriod);
      setPaper(result);
      if (!taxAmount) setTaxAmount(result.payableVatAmount);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoadingPaper(false);
    }
  }

  async function handleNext() {
    if (step === 0) await loadPaper();
    setStep(s => s + 1);
  }

  async function handleSubmit() {
    if (!batch) { toast.error("无可用申报批次"); return; }
    setSubmitting(true);
    try {
      await reviewTaxFilingBatch(batch.id, {
        reviewResult: "approved",
        reviewNotes: reviewNotes || "VAT申报向导审核通过",
      });
      await submitTaxFilingBatch(batch.id);
      toast.success(`增值税申报已完成，申报期间 ${filingPeriod}`);
      setStep(0);
      setPaper(null);
      setReviewNotes("");
      setTaxAmount("");
      onComplete();
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  const outputTax  = parseFloat(paper?.outputTaxAmount  ?? "0");
  const inputTax   = parseFloat(paper?.inputTaxAmount   ?? "0");
  const simplified = parseFloat(paper?.simplifiedTaxAmount ?? "0");
  const payable    = parseFloat(paper?.payableVatAmount  ?? taxAmount ?? "0");

  const steps = [
    {
      title: "数据汇总",
      icon: <CalculatorOutlined />,
      content: (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Alert
            type="info" showIcon
            message={`申报期间：${filingPeriod}`}
            description="系统将从当期已过账凭证中汇总销项税额与进项税额，请确认数据准确后进入下一步。"
          />
          {batch && (
            <Descriptions size="small" bordered column={2}>
              <Descriptions.Item label="批次编号" span={2}>
                <Text copyable style={{ fontSize: 12 }}>{batch.id.slice(0, 16)}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="申报期间">{batch.filingPeriod}</Descriptions.Item>
              <Descriptions.Item label="税种">
                <Tag color="blue">增值税（VAT）</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="当前状态">
                <Tag color={batch.status === "submitted" || batch.status === "archived" ? "success" : "default"}>{batch.status}</Tag>
              </Descriptions.Item>
            </Descriptions>
          )}
          <Alert
            type={batch?.status === "submitted" ? "warning" : "success"}
            showIcon
            message={
              batch?.status === "submitted"
                ? "该期间增值税已申报，再次申报将创建补充申报记录"
                : "点击「下一步」加载当期增值税工作底稿"
            }
          />
        </Space>
      ),
    },
    {
      title: "核对确认",
      icon: <AuditOutlined />,
      content: loadingPaper ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8" }}>正在加载工作底稿…</div>
      ) : paper ? (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Alert
            type="info" showIcon
            message="请核对以下增值税计算数据，如有差异可在此修改应缴税额"
          />
          <Row gutter={[16, 16]}>
            <Col span={8}>
              <Statistic title="销项税额" value={outputTax.toFixed(2)} prefix="¥"
                valueStyle={{ color: "#2563eb", fontSize: 18 }} />
            </Col>
            <Col span={8}>
              <Statistic title="进项税额（可抵扣）" value={inputTax.toFixed(2)} prefix="¥"
                valueStyle={{ color: "#16a34a", fontSize: 18 }} />
            </Col>
            <Col span={8}>
              <Statistic title="简易计税" value={simplified.toFixed(2)} prefix="¥"
                valueStyle={{ fontSize: 18 }} />
            </Col>
          </Row>
          <div style={{ padding: "14px 16px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fde68a" }}>
            <Text type="secondary" style={{ fontSize: 12 }}>应缴增值税（可修改）</Text>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <Text style={{ fontSize: 16 }}>¥</Text>
              <Input
                value={taxAmount}
                onChange={e => setTaxAmount(e.target.value)}
                style={{ maxWidth: 200, fontFamily: "monospace", fontSize: 15, fontWeight: 600 }}
                placeholder="0.00"
              />
              <Button size="small" type="link" onClick={() => setTaxAmount(paper.payableVatAmount)}>
                还原系统计算值
              </Button>
            </div>
          </div>
          {paper.lines.length > 0 && (
            <Table
              size="small"
              dataSource={paper.lines}
              rowKey={(_r, idx) => String(idx)}
              pagination={{ hideOnSinglePage: true, size: "small" }}
              columns={[
                { title: "税种", dataIndex: "vatType" },
                { title: "税率", dataIndex: "taxRate", render: (v: string) => v ? `${v}%` : "—" },
                { title: "税额", dataIndex: "taxAmount", align: "right" as const, render: (v: string) => `¥${parseFloat(v).toFixed(2)}` },
              ]}
            />
          )}
        </Space>
      ) : (
        <Alert type="warning" showIcon message="工作底稿加载失败，请返回重试" />
      ),
    },
    {
      title: "生成申报表",
      icon: <FileTextOutlined />,
      content: (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Alert
            type="success" showIcon
            message="申报表已就绪"
            description="以下为本期增值税申报汇总，请上传缴款凭证后完成申报记录。"
          />
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="申报期间" span={2}>{filingPeriod}</Descriptions.Item>
            <Descriptions.Item label="销项税额">¥{outputTax.toFixed(2)}</Descriptions.Item>
            <Descriptions.Item label="进项税额">¥{inputTax.toFixed(2)}</Descriptions.Item>
            <Descriptions.Item label="应缴税额" span={2}>
              <Text strong style={{ fontSize: 16, color: payable >= 0 ? "#dc2626" : "#16a34a" }}>
                ¥{parseFloat(taxAmount || paper?.payableVatAmount || "0").toFixed(2)}
              </Text>
            </Descriptions.Item>
          </Descriptions>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>审核意见（可选）</Text>
            <Input.TextArea
              value={reviewNotes}
              onChange={e => setReviewNotes(e.target.value)}
              placeholder="填写审核备注，如：数据已与总账核对一致"
              rows={2}
              style={{ marginTop: 6 }}
            />
          </div>
          <Upload beforeUpload={() => false} showUploadList>
            <Button icon={<UploadOutlined />} size="small">上传缴款凭证（可选）</Button>
          </Upload>
        </Space>
      ),
    },
    {
      title: "记录结果",
      icon: <SaveOutlined />,
      content: (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Alert
            type="success" showIcon
            icon={<CheckCircleOutlined />}
            message="准备提交申报"
            description="确认后本期增值税申报状态将更新为「已申报」，并记录操作人和时间。"
          />
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="申报期间" span={2}>{filingPeriod}</Descriptions.Item>
            <Descriptions.Item label="应缴税额" span={2}>
              <Text strong style={{ color: "#dc2626" }}>
                ¥{parseFloat(taxAmount || paper?.payableVatAmount || "0").toFixed(2)}
              </Text>
            </Descriptions.Item>
            {reviewNotes && <Descriptions.Item label="审核意见" span={2}>{reviewNotes}</Descriptions.Item>}
          </Descriptions>
          <Alert
            type="info"
            message="申报完成后可在税务日历中查看本期申报状态，申报记录将同步到审计日志。"
          />
        </Space>
      ),
    },
  ];

  return (
    <Modal
      title={
        <Space>
          <CalculatorOutlined />
          <span>增值税申报向导 — {filingPeriod}</span>
        </Space>
      }
      open={open}
      onCancel={() => { setStep(0); setPaper(null); onClose(); }}
      width={640}
      footer={
        <Space style={{ justifyContent: "flex-end", width: "100%" }}>
          {step > 0 && <Button onClick={() => setStep(s => s - 1)}>上一步</Button>}
          {step < steps.length - 1 && (
            <Button type="primary" loading={loadingPaper} onClick={() => void handleNext()}>
              下一步
            </Button>
          )}
          {step === steps.length - 1 && (
            <Button type="primary" loading={submitting} onClick={() => void handleSubmit()}>
              确认申报
            </Button>
          )}
          <Button onClick={() => { setStep(0); setPaper(null); onClose(); }}>取消</Button>
        </Space>
      }
    >
      <Steps
        current={step}
        size="small"
        style={{ marginBottom: 24 }}
        items={steps.map(s => ({ title: s.title, icon: s.icon }))}
      />
      {steps[step]?.content}
    </Modal>
  );
}
