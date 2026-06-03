/**
 * 往来单位（P7-B2）：客户/供应商档案 + 应收应付画像。
 */
import { useEffect, useState, useCallback } from "react";
import { Table, Tag, Button, Space, Statistic, Row, Col, Modal, Form, Input, Select, InputNumber, Spin } from "antd";
import { TeamOutlined, ReloadOutlined, EditOutlined } from "@ant-design/icons";
import { toast } from "sonner";
import { PageHeader } from "../components/ui/PageHeader";
import { listCounterparties, createCounterparty, updateCounterparty, type Counterparty } from "../lib/api";

const CATEGORY: Record<string, { color: string; label: string }> = {
  customer: { color: "blue", label: "客户" },
  supplier: { color: "purple", label: "供应商" },
  both: { color: "geekblue", label: "客户/供应商" },
};
const RISK: Record<string, { color: string; label: string }> = {
  normal: { color: "default", label: "正常" },
  watch: { color: "warning", label: "关注" },
  high: { color: "error", label: "高风险" },
};

export function CounterpartiesPage() {
  const [items, setItems] = useState<Counterparty[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Counterparty | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try { setItems((await listCounterparties()).items); }
    catch (err) { toast.error((err as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function openEdit(c: Counterparty) {
    setEditing(c);
    form.setFieldsValue({ name: c.name, category: c.category, taxNo: c.taxNo, contactName: c.contactName,
      contactPhone: c.contactPhone, creditLimit: c.creditLimit, creditDays: c.creditDays, riskLevel: c.riskLevel, notes: c.notes });
  }
  function openCreate() {
    setCreateOpen(true);
    form.resetFields();
    form.setFieldsValue({ category: "both", riskLevel: "normal", creditLimit: 0, creditDays: 0 });
  }

  async function handleSave() {
    const v = await form.validateFields();
    try {
      if (editing) {
        await updateCounterparty(editing.id ?? "", v);
        toast.success("已更新");
      } else if (createOpen) {
        await createCounterparty(v);
        toast.success("已新建往来单位");
      }
      setEditing(null); setCreateOpen(false);
      await load();
    } catch (err) { toast.error((err as Error).message); }
  }

  const totalAR = items.reduce((s, c) => s + c.receivable, 0);
  const totalAP = items.reduce((s, c) => s + c.payable, 0);
  const highRisk = items.filter((c) => c.riskLevel === "high").length;

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section className="v3-hero-shell">
        <PageHeader title="往来单位" subtitle="客户与供应商档案，按对方聚合应收应付，识别回款与付款风险。"
          actions={<Space>
            <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
            <Button type="primary" icon={<TeamOutlined />} onClick={openCreate}>新建往来单位</Button>
          </Space>} />
      </section>

      <section className="v3-section-shell" data-tone="accent">
        <Row gutter={16}>
          <Col span={8}><Statistic title="应收合计" value={totalAR} precision={2} prefix="¥" valueStyle={{ color: "#16a34a" }} /></Col>
          <Col span={8}><Statistic title="应付合计" value={totalAP} precision={2} prefix="¥" valueStyle={{ color: "#d97706" }} /></Col>
          <Col span={8}><Statistic title="高风险往来" value={highRisk} valueStyle={{ color: highRisk ? "#dc2626" : "#16a34a" }} /></Col>
        </Row>
      </section>

      <section className="v3-section-shell">
        {loading ? <div style={{ textAlign: "center", padding: 40 }}><Spin /></div> : (
          <Table<Counterparty> size="small" rowKey={(r) => r.id ?? r.name} dataSource={items} pagination={{ pageSize: 20, hideOnSinglePage: true }}
            columns={[
              { title: "名称", dataIndex: "name", render: (v, r) => <Space>{v}{!r.registered && <Tag color="default" style={{ fontSize: 10 }}>未建档</Tag>}</Space> },
              { title: "类别", dataIndex: "category", render: (v) => <Tag color={CATEGORY[v]?.color}>{CATEGORY[v]?.label ?? v}</Tag> },
              { title: "应收", dataIndex: "receivable", align: "right", render: (v, r) => v > 0 ? <span style={{ color: "#16a34a" }}>¥{v.toFixed(2)}<span style={{ color: "#94a3b8", fontSize: 11 }}>（{r.receivableCount}）</span></span> : "—" },
              { title: "应付", dataIndex: "payable", align: "right", render: (v, r) => v > 0 ? <span style={{ color: "#d97706" }}>¥{v.toFixed(2)}<span style={{ color: "#94a3b8", fontSize: 11 }}>（{r.payableCount}）</span></span> : "—" },
              { title: "信用账期", dataIndex: "creditDays", align: "center", render: (v) => v > 0 ? `${v} 天` : "—" },
              { title: "风险", dataIndex: "riskLevel", render: (v) => <Tag color={RISK[v]?.color}>{RISK[v]?.label ?? v}</Tag> },
              { title: "操作", render: (_, r) => <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEdit(r)}>{r.registered ? "编辑" : "建档"}</Button> },
            ]}
            locale={{ emptyText: "暂无往来单位，发票录入后会自动聚合，或点击「新建」建档" }} />
        )}
      </section>

      <Modal open={!!editing || createOpen} title={editing ? `编辑 · ${editing.name}` : "新建往来单位"}
        onOk={() => void handleSave()} onCancel={() => { setEditing(null); setCreateOpen(false); }} okText="保存" cancelText="取消">
        <Form form={form} layout="vertical" size="small" style={{ paddingTop: 8 }}>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input disabled={!!editing} /></Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="category" label="类别"><Select options={[{ value: "customer", label: "客户" }, { value: "supplier", label: "供应商" }, { value: "both", label: "客户/供应商" }]} /></Form.Item></Col>
            <Col span={12}><Form.Item name="riskLevel" label="风险等级"><Select options={[{ value: "normal", label: "正常" }, { value: "watch", label: "关注" }, { value: "high", label: "高风险" }]} /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="creditLimit" label="信用额度(元)"><InputNumber style={{ width: "100%" }} min={0} /></Form.Item></Col>
            <Col span={12}><Form.Item name="creditDays" label="信用账期(天)"><InputNumber style={{ width: "100%" }} min={0} /></Form.Item></Col>
          </Row>
          <Form.Item name="taxNo" label="税号"><Input /></Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="contactName" label="联系人"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="contactPhone" label="联系电话"><Input /></Form.Item></Col>
          </Row>
          <Form.Item name="notes" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
