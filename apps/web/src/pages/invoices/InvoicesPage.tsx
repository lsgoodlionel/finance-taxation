/**
 * 发票台账页面（P1）
 * 路由：/invoices
 * 功能：
 *   - 进项/销项发票列表
 *   - 手动录入发票
 *   - 一键验真（P1本地规则，P2接税务局API）
 *   - OCR 识别录入
 *   - 关联到经营事项
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import {
  Typography, Card, Table, Tag, Button, Space, Modal, Form, Input,
  Select, DatePicker, Alert, Tabs, Statistic, Row, Col, Upload, Empty, Skeleton,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  AuditOutlined, PlusOutlined, SafetyOutlined, CameraOutlined, SyncOutlined,
  CheckCircleOutlined, WarningOutlined, ClockCircleOutlined, ImportOutlined,
} from "@ant-design/icons";
import { toast } from "sonner";
import dayjs from "dayjs";
import type { RcFile } from "antd/es/upload";
import {
  listInvoices, createInvoice, verifyInvoice, ocrInvoice, deleteInvoice, generateInvoiceVoucher,
  parseEInvoice, type Invoice, type EInvoicePayload,
} from "../../lib/api";

const { Text } = Typography;

const VERIFY_COLOR: Record<string, string> = {
  pending: "default", verified: "success", invalid: "error", error: "warning",
};
const VERIFY_LABELS: Record<string, string> = {
  pending: "待验真", verified: "已验真", invalid: "不合规", error: "验真异常",
};
const INV_TYPE_LABELS: Record<string, string> = {
  vat_special: "增值税专票", vat_general: "增值税普票", electronic: "电子发票",
  receipt: "收据", other: "其他",
};

export function InvoicesPage() {
  const navigate = useNavigate();
  const [invoices, setInvoices]     = useState<Invoice[]>([]);
  const [loading, setLoading]       = useState(true);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [genVoucherId, setGenVoucherId] = useState<string | null>(null);
  const [addOpen, setAddOpen]       = useState(false);
  const [ocrOpen, setOcrOpen]       = useState(false);
  const [ocrText, setOcrText]       = useState("");
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult]   = useState<Record<string, unknown> | null>(null);
  const [eInvoiceOpen, setEInvoiceOpen]       = useState(false);
  const [eInvoiceText, setEInvoiceText]       = useState("");
  const [eInvoiceLoading, setEInvoiceLoading] = useState(false);
  const [eInvoiceErrors, setEInvoiceErrors]   = useState<string[] | null>(null);
  const [form] = Form.useForm();
  const [directionFilter, setDirectionFilter] = useState<"input" | "output" | "">("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listInvoices({ direction: directionFilter || undefined, pageSize: 100 });
      setInvoices(data.items);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [directionFilter]);

  useEffect(() => { void load(); }, [load]);

  async function handleCreate() {
    const values = await form.validateFields();
    try {
      await createInvoice({
        ...values,
        invoiceDate: values.invoiceDate ? dayjs(values.invoiceDate).format("YYYY-MM-DD") : "",
        amount: parseFloat(values.amount ?? "0"),
        taxAmount: parseFloat(values.taxAmount ?? "0"),
      });
      toast.success("发票已录入");
      setAddOpen(false);
      form.resetFields();
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function handleVerify(id: string) {
    setVerifyingId(id);
    try {
      const result = await verifyInvoice(id);
      if (result.verifyStatus === "verified") {
        toast.success(`发票验真通过：${result.message}`);
      } else {
        toast.error(`发票验真未通过：${result.message}`);
      }
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setVerifyingId(null);
    }
  }

  async function handleGenVoucher(id: string) {
    setGenVoucherId(id);
    try {
      const r = await generateInvoiceVoucher(id);
      toast.success(`已生成凭证草稿：${r.summary}`);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setGenVoucherId(null);
    }
  }

  async function handleOcr() {
    if (!ocrText.trim()) { toast.error("请输入发票文字内容"); return; }
    setOcrLoading(true);
    try {
      const result = await ocrInvoice({ text: ocrText });
      if (result.extracted) {
        setOcrResult(result.extracted);
        const f = result.extracted as Record<string, unknown>;
        form.setFieldsValue({
          invoiceType: f.invoiceType,
          invoiceCode: f.invoiceCode,
          invoiceNo: f.invoiceNo,
          invoiceDate: f.invoiceDate ? dayjs(f.invoiceDate as string) : undefined,
          sellerName: f.sellerName,
          sellerTaxNo: f.sellerTaxNo,
          buyerName: f.buyerName,
          buyerTaxNo: f.buyerTaxNo,
          amount: f.amount ? String(f.amount) : undefined,
          taxAmount: f.taxAmount ? String(f.taxAmount) : undefined,
        });
        setOcrOpen(false);
        setAddOpen(true);
        toast.success("OCR 识别成功，请核对信息后保存");
      } else {
        toast.error("OCR 未能识别发票信息，请手动录入");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setOcrLoading(false);
    }
  }

  async function handleImageUpload(file: RcFile) {
    setOcrLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      bytes.forEach(b => { binary += String.fromCharCode(b); });
      const base64 = btoa(binary);
      const result = await ocrInvoice({ imageBase64: base64 });
      if (result.extracted) {
        const f = result.extracted as Record<string, unknown>;
        form.setFieldsValue({
          invoiceNo: f.invoiceNo, invoiceCode: f.invoiceCode,
          sellerName: f.sellerName, sellerTaxNo: f.sellerTaxNo,
          amount: f.amount ? String(f.amount) : undefined,
          taxAmount: f.taxAmount ? String(f.taxAmount) : undefined,
        });
        setOcrOpen(false);
        setAddOpen(true);
        toast.success("图片识别成功，请核对并补充信息");
      } else {
        toast.warning("图片识别效果有限，建议手动输入发票文字内容后再试");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setOcrLoading(false);
    }
    return false;
  }

  function closeEInvoiceModal() {
    setEInvoiceOpen(false);
    setEInvoiceText("");
    setEInvoiceErrors(null);
  }

  async function handleImportEInvoice() {
    if (!eInvoiceText.trim()) { toast.error("请粘贴数电票 JSON 内容"); return; }
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(eInvoiceText) as Record<string, unknown>;
    } catch {
      toast.error("JSON 格式不正确，请检查粘贴内容");
      return;
    }

    const payload: EInvoicePayload = {
      invoiceNumber: String(raw.invoiceNumber ?? ""),
      issueDate: String(raw.issueDate ?? ""),
      sellerTaxNo: String(raw.sellerTaxNo ?? ""),
      buyerTaxNo: String(raw.buyerTaxNo ?? ""),
      amount: Number(raw.amount),
      tax: Number(raw.tax),
      total: Number(raw.total),
      direction: raw.direction === "output" ? "output" : raw.direction === "input" ? "input" : undefined,
    };

    setEInvoiceLoading(true);
    setEInvoiceErrors(null);
    try {
      const result = await parseEInvoice(payload);
      if (result.ok) {
        toast.success(`数电票导入成功${result.invoiceId ? "：" + result.invoiceId : ""}`);
        closeEInvoiceModal();
        await load();
      } else {
        setEInvoiceErrors(result.errors && result.errors.length > 0 ? result.errors : ["数电票校验未通过，请检查字段内容"]);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setEInvoiceLoading(false);
    }
  }

  const pendingCount   = invoices.filter(i => i.verify_status === "pending").length;
  const verifiedCount  = invoices.filter(i => i.verify_status === "verified").length;
  const invalidCount   = invoices.filter(i => i.verify_status === "invalid").length;
  const inputTotal     = invoices.filter(i => i.direction === "input")
    .reduce((s, i) => s + Number(i.total_amount), 0);

  const columns: ColumnsType<Invoice> = [
    {
      title: "发票号码", key: "no",
      render: (_: unknown, r: Invoice) => (
        <div>
          <Text strong style={{ fontSize: 12 }}>{r.invoice_no}</Text>
          {r.invoice_code && <div style={{ fontSize: 11, color: "#94a3b8" }}>{r.invoice_code}</div>}
        </div>
      ),
    },
    {
      title: "类型", dataIndex: "invoice_type", key: "type", width: 100,
      render: (v: string) => <Tag style={{ fontSize: 10 }}>{INV_TYPE_LABELS[v] ?? v}</Tag>,
    },
    {
      title: "方向", dataIndex: "direction", key: "dir", width: 70,
      render: (v: string) => <Tag color={v === "input" ? "blue" : "purple"} style={{ fontSize: 10 }}>
        {v === "input" ? "进项" : "销项"}
      </Tag>,
    },
    {
      title: "销售方", dataIndex: "seller_name", key: "seller",
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: "开票日期", dataIndex: "invoice_date", key: "date", width: 100,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: "价税合计", dataIndex: "total_amount", key: "amount", width: 110, align: "right",
      render: (v: number) => (
        <Text strong style={{ fontFamily: "monospace", fontSize: 12 }}>
          ¥{Number(v).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
        </Text>
      ),
    },
    {
      title: "验真", dataIndex: "verify_status", key: "verify", width: 90,
      filters: Object.entries(VERIFY_LABELS).map(([v, t]) => ({ text: t, value: v })),
      onFilter: (val, r) => r.verify_status === val,
      render: (v: string) => <Tag color={VERIFY_COLOR[v] ?? "default"} style={{ fontSize: 10 }}>{VERIFY_LABELS[v] ?? v}</Tag>,
    },
    {
      title: "操作", key: "actions", width: 180,
      render: (_: unknown, record: Invoice) => (
        <Space size={4}>
          {record.verify_status === "pending" && (
            <Button size="small" icon={<SafetyOutlined />}
              loading={verifyingId === record.id}
              onClick={() => void handleVerify(record.id)}>
              验真
            </Button>
          )}
          {record.voucher_id ? (
            <Button size="small" type="link" onClick={() => navigate("/vouchers")}>已生成凭证</Button>
          ) : (
            <Button size="small" type="link" loading={genVoucherId === record.id}
              onClick={() => void handleGenVoucher(record.id)}>生成凭证</Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {/* Hero header */}
      <section className="v3-hero-shell">
        <PageHeader
          title="发票台账"
          subtitle="管理进销项发票，验真防假，关联经营事项"
          actions={(
            <Space>
              <Button icon={<ImportOutlined />} onClick={() => setEInvoiceOpen(true)}>导入数电票</Button>
              <Button icon={<CameraOutlined />} onClick={() => setOcrOpen(true)}>OCR 识别</Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>手动录入</Button>
              <Button icon={<SyncOutlined />} onClick={() => void load()} />
            </Space>
          )}
        />
      </section>

      {/* KPI */}
      <Row gutter={[16, 16]}>
        {[
          { title: "待验真", value: pendingCount, color: pendingCount > 0 ? "#d97706" : "#64748b", icon: <ClockCircleOutlined /> },
          { title: "已验真", value: verifiedCount, color: "#16a34a", icon: <CheckCircleOutlined /> },
          { title: "不合规", value: invalidCount, color: invalidCount > 0 ? "#dc2626" : "#64748b", icon: <WarningOutlined /> },
          { title: "本期进项合计", value: inputTotal.toFixed(2), color: "#2563eb", icon: <AuditOutlined />, prefix: "¥" },
        ].map(item => (
          <Col key={item.title} xs={24} sm={12} lg={6}>
            <Card style={{ borderRadius: 10 }} styles={{ body: { padding: "16px 20px" } }}>
              <Statistic title={item.title} value={item.value}
                prefix={item.prefix ?? item.icon}
                valueStyle={{ fontSize: 20, color: item.color }} />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Alert if invalid invoices */}
      {invalidCount > 0 && (
        <Alert type="error" showIcon icon={<WarningOutlined />}
          message={`${invalidCount} 张发票验真未通过，存在合规风险，请及时核查并联系开票方`} />
      )}

      {/* Filter */}
      <Space>
        <Text type="secondary" style={{ fontSize: 13 }}>筛选：</Text>
        <Select
          value={directionFilter}
          onChange={setDirectionFilter}
          style={{ width: 120 }}
          options={[
            { value: "", label: "全部" },
            { value: "input", label: "进项发票" },
            { value: "output", label: "销项发票" },
          ]}
        />
      </Space>

      {/* Invoice table */}
      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: 0 } }}>
        {loading ? (
          <div style={{ padding: 24 }}><Skeleton active paragraph={{ rows: 6 }} /></div>
        ) : (
          <Table
            dataSource={invoices}
            columns={columns}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 20, hideOnSinglePage: true, size: "small",
              showTotal: t => `共 ${t} 张` }}
            locale={{ emptyText: <Empty description="暂无发票，点击「手动录入」或「OCR识别」添加" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          />
        )}
      </Card>

      {/* Add invoice modal */}
      <Modal
        title={<Space><AuditOutlined />录入发票</Space>}
        open={addOpen}
        onOk={() => void handleCreate()}
        onCancel={() => { setAddOpen(false); form.resetFields(); setOcrResult(null); }}
        okText="保存"
        cancelText="取消"
        width={580}
      >
        {ocrResult && (
          <Alert type="success" showIcon message="OCR 识别结果已预填，请核对后保存"
            style={{ marginBottom: 12 }} />
        )}
        <Form form={form} layout="vertical" size="small" style={{ paddingTop: 8 }}>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="direction" label="发票方向" initialValue="input">
                <Select options={[{ value: "input", label: "进项" }, { value: "output", label: "销项" }]} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="invoiceType" label="发票类型" initialValue="vat_special">
                <Select options={Object.entries(INV_TYPE_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="invoiceDate" label="开票日期" rules={[{ required: true }]}>
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="invoiceCode" label="发票代码">
                <Input placeholder="10位或12位" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="invoiceNo" label="发票号码" rules={[{ required: true }]}>
                <Input placeholder="8位数字" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="sellerName" label="销售方名称" rules={[{ required: true }]}>
            <Input placeholder="开票单位名称" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="sellerTaxNo" label="销售方税号">
                <Input placeholder="纳税人识别号" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="buyerName" label="购买方名称">
                <Input placeholder="本公司名称" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="amount" label="不含税金额">
                <Input prefix="¥" placeholder="0.00" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="taxAmount" label="税额">
                <Input prefix="¥" placeholder="0.00" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="taxRate" label="税率">
                <Input suffix="%" placeholder="13" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="businessEventId" label="关联事项 ID（可选）">
            <Input placeholder="粘贴经营事项 ID" />
          </Form.Item>
        </Form>
      </Modal>

      {/* OCR modal */}
      <Modal
        title={<Space><CameraOutlined />OCR 发票识别</Space>}
        open={ocrOpen}
        onOk={() => void handleOcr()}
        onCancel={() => { setOcrOpen(false); setOcrText(""); }}
        okText="识别"
        cancelText="取消"
        confirmLoading={ocrLoading}
        width={520}
      >
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          message="方法一：上传发票图片（JPG/PNG）；方法二：粘贴发票文字内容" />
        <Upload.Dragger accept=".jpg,.jpeg,.png" showUploadList={false}
          beforeUpload={handleImageUpload} style={{ marginBottom: 12 }}>
          <div style={{ padding: "12px 0" }}>
            <CameraOutlined style={{ fontSize: 24, color: "#2563eb", marginBottom: 6 }} />
            <p style={{ fontSize: 13, margin: 0 }}>点击或拖拽发票图片</p>
          </div>
        </Upload.Dragger>
        <Input.TextArea
          value={ocrText}
          onChange={e => setOcrText(e.target.value)}
          placeholder="或粘贴发票文字内容（发票代码、号码、金额、开票日期、购销双方名称等）"
          rows={5}
          style={{ fontSize: 12 }}
        />
      </Modal>

      {/* Import e-invoice (数电票) modal */}
      <Modal
        title={<Space><ImportOutlined />导入数电票</Space>}
        open={eInvoiceOpen}
        onOk={() => void handleImportEInvoice()}
        onCancel={closeEInvoiceModal}
        okText="解析并导入"
        cancelText="取消"
        confirmLoading={eInvoiceLoading}
        width={560}
      >
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          message="粘贴数电票结构化 JSON，字段包含 invoiceNumber、issueDate、sellerTaxNo、buyerTaxNo、amount、tax、total，direction 可选（input 进项 / output 销项）" />
        <Input.TextArea
          value={eInvoiceText}
          onChange={e => { setEInvoiceText(e.target.value); setEInvoiceErrors(null); }}
          placeholder={'{\n  "invoiceNumber": "25332000000012345678",\n  "issueDate": "2026-07-10",\n  "sellerTaxNo": "91330000MA2XXXXXXX",\n  "buyerTaxNo": "91330000MA2YYYYYYY",\n  "amount": 1000.00,\n  "tax": 130.00,\n  "total": 1130.00,\n  "direction": "input"\n}'}
          rows={10}
          style={{ fontSize: 12, fontFamily: "monospace" }}
        />
        {eInvoiceErrors && (
          <Alert
            type="error"
            showIcon
            style={{ marginTop: 12 }}
            message="数电票校验未通过"
            description={(
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {eInvoiceErrors.map(err => <li key={err}>{err}</li>)}
              </ul>
            )}
          />
        )}
      </Modal>
    </div>
  );
}
