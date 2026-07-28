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
import {
  Typography, Card, Table, Tag, Button, Space, Form,
  Select, Alert, Statistic, Row, Col, Empty, Skeleton,
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
import { InvoiceEntryModals } from "./InvoiceEntryModals";
import { INV_TYPE_LABELS, VERIFY_COLOR, VERIFY_LABELS } from "./invoice-labels";

const { Text } = Typography;


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
    // V10：页头与业务链路条已上交 /bills 容器，这里只留「关键数字」与「台账」两块。
    // 原先的独立筛选行、录入动作行、告警行都并入台账卡的卡头，不再各占一屏行。
    <div style={{ display: "grid", gap: 16 }}>
      {/* 关键数字：紧凑一条，替代原来四张大 KPI 卡 */}
      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: "12px 20px" } }}>
        <Row gutter={[16, 12]}>
          {[
            { title: "待验真", value: pendingCount, color: pendingCount > 0 ? "#d97706" : "#64748b", icon: <ClockCircleOutlined /> },
            { title: "已验真", value: verifiedCount, color: "#16a34a", icon: <CheckCircleOutlined /> },
            { title: "不合规", value: invalidCount, color: invalidCount > 0 ? "#dc2626" : "#64748b", icon: <WarningOutlined /> },
            { title: "本期进项合计", value: inputTotal.toFixed(2), color: "#2563eb", icon: <AuditOutlined />, prefix: "¥" },
          ].map(item => (
            <Col key={item.title} xs={12} lg={6}>
              <Statistic title={item.title} value={item.value}
                prefix={item.prefix ?? item.icon}
                valueStyle={{ fontSize: 18, color: item.color }} />
            </Col>
          ))}
        </Row>
      </Card>

      {/* 发票台账：筛选、录入动作、合规告警与表格同属一块 */}
      <Card
        style={{ borderRadius: 12 }}
        styles={{ body: { padding: 0 } }}
        title={(
          <Space size={8}>
            <Text type="secondary" style={{ fontSize: 13, fontWeight: 400 }}>筛选</Text>
            <Select
              value={directionFilter}
              onChange={setDirectionFilter}
              style={{ width: 120 }}
              aria-label="按发票方向筛选"
              options={[
                { value: "", label: "全部" },
                { value: "input", label: "进项发票" },
                { value: "output", label: "销项发票" },
              ]}
            />
          </Space>
        )}
        extra={(
          <Space wrap>
            <Button icon={<ImportOutlined />} onClick={() => setEInvoiceOpen(true)}>导入数电票</Button>
            <Button icon={<CameraOutlined />} onClick={() => setOcrOpen(true)}>OCR 识别</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>手动录入</Button>
            <Button icon={<SyncOutlined />} aria-label="刷新发票列表" onClick={() => void load()} />
          </Space>
        )}
      >
        {invalidCount > 0 && (
          <Alert type="error" showIcon icon={<WarningOutlined />} style={{ margin: 16 }}
            message={`${invalidCount} 张发票验真未通过，存在合规风险，请及时核查并联系开票方`} />
        )}
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

      <InvoiceEntryModals
        form={form}
        entry={{
          open: addOpen,
          prefilledByOcr: ocrResult !== null,
          onSubmit: () => void handleCreate(),
          onCancel: () => { setAddOpen(false); form.resetFields(); setOcrResult(null); },
        }}
        ocr={{
          open: ocrOpen,
          text: ocrText,
          loading: ocrLoading,
          onTextChange: setOcrText,
          onUploadImage: handleImageUpload,
          onSubmit: () => void handleOcr(),
          onCancel: () => { setOcrOpen(false); setOcrText(""); },
        }}
        eInvoice={{
          open: eInvoiceOpen,
          text: eInvoiceText,
          loading: eInvoiceLoading,
          errors: eInvoiceErrors,
          onTextChange: (value) => { setEInvoiceText(value); setEInvoiceErrors(null); },
          onSubmit: () => void handleImportEInvoice(),
          onCancel: closeEInvoiceModal,
        }}
      />
    </div>
  );
}
