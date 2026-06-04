/**
 * 反馈与升级需求（Phase9 任务2）：用户提交问题/建议 → 浓缩为升级需求 →
 * 决策者审批 → 提交开发。成为系统持续优化升级的底层数据支撑。
 */
import { useEffect, useState, useCallback } from "react";
import {
  Row, Col, Card, Button, Tag, Space, Typography, Table, Modal, Form, Input, Select, Tabs, Alert,
} from "antd";
import { BulbOutlined, ThunderboltOutlined, CheckOutlined, CloseOutlined, PlusOutlined } from "@ant-design/icons";
import { toast } from "sonner";
import { PageHeader } from "../components/ui/PageHeader";
import {
  submitFeedback, listFeedback, consolidateFeedback, listProposals, decideProposal,
  type FeedbackRow, type ProposalRow,
} from "../lib/api";

const { Text, Paragraph } = Typography;

const CAT: Record<string, { color: string; label: string }> = {
  bug: { color: "error", label: "缺陷" }, suggestion: { color: "blue", label: "建议" }, question: { color: "default", label: "疑问" },
};
const FB_STATUS: Record<string, string> = { open: "待处理", triaged: "已分诊", merged: "已并入需求", closed: "已关闭" };
const PRIORITY: Record<string, { color: string; label: string }> = { high: { color: "red", label: "高" }, medium: { color: "orange", label: "中" }, low: { color: "default", label: "低" } };
const PROP_STATUS: Record<string, { color: string; label: string }> = {
  draft: { color: "default", label: "草案" }, submitted: { color: "processing", label: "待审批" },
  approved: { color: "success", label: "已批准" }, rejected: { color: "error", label: "已驳回" },
  in_development: { color: "purple", label: "开发中" }, done: { color: "green", label: "已上线" },
};

export function FeedbackPage() {
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    try {
      const [f, p] = await Promise.all([listFeedback(), listProposals()]);
      setFeedback(f.items); setProposals(p.items);
    } catch (err) { toast.error((err as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function handleSubmit() {
    const v = await form.validateFields();
    setBusy(true);
    try { await submitFeedback(v); toast.success("反馈已提交，感谢！"); setCreateOpen(false); form.resetFields(); await load(); }
    catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  }
  async function handleConsolidate() {
    setBusy(true);
    try { const r = await consolidateFeedback(); toast.success(`已浓缩为升级需求（优先级${r.priority}），待决策者审批`); await load(); }
    catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  }
  async function handleDecide(id: string, decision: string) {
    try { await decideProposal(id, decision); toast.success("已处理"); await load(); }
    catch (err) { toast.error((err as Error).message); }
  }

  const openCount = feedback.filter((f) => f.status === "open").length;

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section className="v3-hero-shell">
        <PageHeader title="反馈与升级需求"
          subtitle="收集使用问题与建议，浓缩为升级需求建议，经决策者批准后提交开发，驱动系统持续优化升级。"
          actions={<Space>
            <Button icon={<ThunderboltOutlined />} loading={busy} disabled={openCount === 0} onClick={() => void handleConsolidate()}>
              浓缩为升级需求（{openCount}）
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); form.setFieldsValue({ category: "suggestion" }); setCreateOpen(true); }}>提交反馈</Button>
          </Space>} />
      </section>

      <Tabs items={[
        {
          key: "feedback", label: `用户反馈（${feedback.length}）`,
          children: (
            <Table<FeedbackRow> size="small" rowKey="id" dataSource={feedback} pagination={{ pageSize: 12, hideOnSinglePage: true }}
              columns={[
                { title: "类别", dataIndex: "category", width: 70, render: (v) => <Tag color={CAT[v]?.color}>{CAT[v]?.label ?? v}</Tag> },
                { title: "标题", dataIndex: "title" },
                { title: "模块", dataIndex: "module", width: 100, render: (v) => v || "—" },
                { title: "提交人", dataIndex: "user_name", width: 90, render: (v) => v || "—" },
                { title: "状态", dataIndex: "status", width: 100, render: (v) => <Tag>{FB_STATUS[v] ?? v}</Tag> },
                { title: "时间", dataIndex: "created_at", width: 100, render: (v) => String(v).slice(0, 10) },
              ]}
              locale={{ emptyText: "暂无反馈，点击「提交反馈」开始" }} />
          ),
        },
        {
          key: "proposals", label: `升级需求（${proposals.length}）`,
          children: (
            <Row gutter={[16, 16]}>
              {proposals.length === 0 && <Col span={24}><Alert type="info" showIcon message="暂无升级需求，先收集反馈后点击「浓缩为升级需求」生成。" /></Col>}
              {proposals.map((p) => (
                <Col key={p.id} xs={24} lg={12}>
                  <Card size="small" style={{ borderRadius: 12 }}
                    title={<Space><BulbOutlined style={{ color: "#7c3aed" }} /><Text strong style={{ fontSize: 13 }}>{p.title}</Text></Space>}
                    extra={<Space><Tag color={PRIORITY[p.priority]?.color}>优先级{PRIORITY[p.priority]?.label}</Tag><Tag color={PROP_STATUS[p.status]?.color}>{PROP_STATUS[p.status]?.label ?? p.status}</Tag></Space>}>
                    <Paragraph style={{ fontSize: 12, whiteSpace: "pre-wrap", color: "#4d5d6c", marginBottom: 8, maxHeight: 160, overflow: "auto" }}>{p.summary}</Paragraph>
                    <Text type="secondary" style={{ fontSize: 11 }}>来源 {p.source_count} 条反馈 · {String(p.created_at).slice(0, 10)}{p.decided_by_name && ` · 决策人 ${p.decided_by_name}`}</Text>
                    {p.status === "submitted" && (
                      <div style={{ marginTop: 10 }}>
                        <Space>
                          <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => void handleDecide(p.id, "approved")}>批准</Button>
                          <Button size="small" onClick={() => void handleDecide(p.id, "in_development")}>转开发中</Button>
                          <Button size="small" danger icon={<CloseOutlined />} onClick={() => void handleDecide(p.id, "rejected")}>驳回</Button>
                        </Space>
                      </div>
                    )}
                    {p.status === "approved" && <div style={{ marginTop: 10 }}><Button size="small" onClick={() => void handleDecide(p.id, "in_development")}>转开发中</Button></div>}
                    {p.status === "in_development" && <div style={{ marginTop: 10 }}><Button size="small" onClick={() => void handleDecide(p.id, "done")}>标记已上线</Button></div>}
                    {p.decision_note && <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>决策意见：{p.decision_note}</div>}
                  </Card>
                </Col>
              ))}
            </Row>
          ),
        },
      ]} />

      <Modal open={createOpen} title="提交问题 / 建议" onOk={() => void handleSubmit()} onCancel={() => setCreateOpen(false)}
        okText="提交" cancelText="取消" confirmLoading={busy}>
        <Form form={form} layout="vertical" size="small" style={{ paddingTop: 8 }}>
          <Form.Item name="category" label="类别"><Select options={[{ value: "bug", label: "缺陷（功能不正常）" }, { value: "suggestion", label: "建议（希望新增/优化）" }, { value: "question", label: "疑问（使用不清楚）" }]} /></Form.Item>
          <Form.Item name="title" label="标题" rules={[{ required: true }]}><Input placeholder="一句话描述问题或建议" /></Form.Item>
          <Form.Item name="module" label="涉及模块（可选）"><Input placeholder="如：发票台账 / 月度结账" /></Form.Item>
          <Form.Item name="content" label="详细说明（可选）"><Input.TextArea rows={3} placeholder="复现步骤、期望效果等" /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
