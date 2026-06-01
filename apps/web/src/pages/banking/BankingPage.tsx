/**
 * 银行管理页面（P1）
 * 路由：/banking
 * 功能：
 *   - 银行账户管理（多账户）
 *   - 银行流水导入（CSV）
 *   - 流水列表 + 对账状态
 *   - 未匹配汇总
 */
import { useState, useEffect, useCallback } from "react";
import {
  Typography, Card, Row, Col, Button, Space, Table, Tag, Upload, Alert,
  Statistic, Tabs, Modal, Form, Input, Switch, Empty, Skeleton, Select,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  BankOutlined, UploadOutlined, CheckCircleOutlined, ClockCircleOutlined,
  PlusOutlined, SyncOutlined,
} from "@ant-design/icons";
import { toast } from "sonner";
import type { RcFile } from "antd/es/upload";
import {
  listBankAccounts, createBankAccount, listBankStatements, importBankStatements,
  getBankUnmatchedSummary,
  type BankAccount, type BankStatement,
} from "../../lib/api";

const { Title, Text } = Typography;

const MATCH_STATUS_COLOR: Record<string, string> = {
  unmatched: "warning", auto: "processing", manual: "success", excluded: "default",
};
const MATCH_STATUS_LABELS: Record<string, string> = {
  unmatched: "未匹配", auto: "自动匹配", manual: "手动匹配", excluded: "已排除",
};

export function BankingPage() {
  const [accounts, setAccounts]     = useState<BankAccount[]>([]);
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [summary, setSummary]       = useState<Record<string, { count: number; totalAmount: number }>>({});
  const [loading, setLoading]       = useState(true);
  const [importing, setImporting]   = useState(false);
  const [addOpen, setAddOpen]       = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>(undefined);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [accs, stmts, smry] = await Promise.all([
        listBankAccounts(),
        listBankStatements({ pageSize: 50 }),
        getBankUnmatchedSummary(),
      ]);
      setAccounts(accs.items);
      setStatements(stmts.items);
      setSummary(smry);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleImport(file: RcFile) {
    setImporting(true);
    try {
      const text = await file.text();
      const result = await importBankStatements(text, selectedAccountId);
      toast.success(`导入完成：新增 ${result.inserted} 条，重复跳过 ${result.skipped} 条（识别格式：${result.detectedFormat}）`);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setImporting(false);
    }
    return false; // prevent antd auto upload
  }

  async function handleAddAccount() {
    const values = await form.validateFields();
    try {
      await createBankAccount(values);
      toast.success("银行账户已添加");
      setAddOpen(false);
      form.resetFields();
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const unmatchedCount = summary.unmatched?.count ?? 0;
  const autoCount      = summary.auto?.count ?? 0;

  // Account columns
  const accountColumns: ColumnsType<BankAccount> = [
    { title: "银行名称", dataIndex: "bank_name", key: "bank" },
    { title: "账号", dataIndex: "account_no", key: "no",
      render: (v: string) => <Text style={{ fontFamily: "monospace", fontSize: 12 }}>{v}</Text> },
    { title: "户名", dataIndex: "account_name", key: "name" },
    { title: "币种", dataIndex: "currency", key: "currency", width: 70 },
    {
      title: "类型", key: "type", width: 130,
      render: (_: unknown, r: BankAccount) => (
        <Space size={4}>
          {r.is_primary && <Tag color="blue" style={{ fontSize: 10 }}>主账户</Tag>}
          {r.is_payroll && <Tag color="green" style={{ fontSize: 10 }}>工资代发</Tag>}
        </Space>
      ),
    },
  ];

  // Statement columns
  const stmtColumns: ColumnsType<BankStatement> = [
    {
      title: "交易日期", dataIndex: "transaction_date", key: "date", width: 110,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: "金额", dataIndex: "amount", key: "amount", width: 130, align: "right",
      render: (v: number) => (
        <Text strong style={{ fontSize: 13, color: v >= 0 ? "#16a34a" : "#dc2626", fontFamily: "monospace" }}>
          {v >= 0 ? "+" : ""}{Number(v).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
        </Text>
      ),
    },
    {
      title: "对方户名", dataIndex: "counterparty_name", key: "name",
      render: (v: string | null) => v || <Text type="secondary">—</Text>,
    },
    {
      title: "摘要", dataIndex: "description", key: "desc",
      render: (v: string | null) => <Text style={{ fontSize: 12 }}>{v ?? "—"}</Text>,
    },
    {
      title: "对账状态", dataIndex: "match_status", key: "match", width: 100,
      filters: ["unmatched", "auto", "manual", "excluded"].map(v => ({ text: MATCH_STATUS_LABELS[v]!, value: v })),
      onFilter: (val, r) => r.match_status === val,
      render: (v: string) => (
        <Tag color={MATCH_STATUS_COLOR[v] ?? "default"} style={{ fontSize: 11 }}>
          {MATCH_STATUS_LABELS[v] ?? v}
        </Tag>
      ),
    },
  ];

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>银行管理</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>管理银行账户、导入银行流水、自动对账凭证</Text>
        </div>
        <Space>
          <Button icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>添加银行账户</Button>
          <Button icon={<SyncOutlined />} onClick={() => void load()}>刷新</Button>
        </Space>
      </div>

      {/* KPI */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card style={{ borderRadius: 10 }} styles={{ body: { padding: "16px 20px" } }}>
            <Statistic title="银行账户数" value={accounts.length} prefix={<BankOutlined />}
              valueStyle={{ color: "#2563eb" }} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card style={{ borderRadius: 10 }} styles={{ body: { padding: "16px 20px" } }}>
            <Statistic title="未对账流水" value={unmatchedCount} prefix={<ClockCircleOutlined />}
              valueStyle={{ color: unmatchedCount > 0 ? "#d97706" : "#64748b" }} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card style={{ borderRadius: 10 }} styles={{ body: { padding: "16px 20px" } }}>
            <Statistic title="自动匹配成功" value={autoCount} prefix={<CheckCircleOutlined />}
              valueStyle={{ color: "#16a34a" }} />
          </Card>
        </Col>
      </Row>

      {/* Main tabs */}
      <Card style={{ borderRadius: 12 }}>
        <Tabs
          items={[
            {
              key: "import",
              label: "导入流水",
              children: (
                <Space direction="vertical" size={16} style={{ width: "100%" }}>
                  <Alert type="info" showIcon message="支持招商银行、工商银行、建设银行 CSV 格式，以及通用格式（日期/摘要/借方/贷方/余额）" />
                  <Space>
                    <Text type="secondary" style={{ fontSize: 13 }}>关联银行账户：</Text>
                    <Select
                      style={{ width: 240 }}
                      placeholder="选择银行账户（可选）"
                      allowClear
                      value={selectedAccountId}
                      onChange={setSelectedAccountId}
                      options={accounts.map(a => ({ value: a.id, label: `${a.bank_name} ${a.account_no}` }))}
                    />
                  </Space>
                  <Upload.Dragger
                    accept=".csv,.txt"
                    showUploadList={false}
                    beforeUpload={handleImport}
                    multiple={false}
                  >
                    <div style={{ padding: "20px 0" }}>
                      <UploadOutlined style={{ fontSize: 28, color: "#2563eb", marginBottom: 8 }} />
                      <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>点击或拖拽银行流水 CSV 文件</p>
                      <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>
                        支持招行/工行/建行/通用格式 · 系统自动识别列头 · 重复流水自动去重
                      </p>
                    </div>
                  </Upload.Dragger>
                  {importing && <Alert type="info" message="正在导入并尝试自动对账，请稍候…" showIcon />}
                </Space>
              ),
            },
            {
              key: "statements",
              label: `流水明细 (${statements.length})`,
              children: (
                <Table
                  dataSource={statements}
                  columns={stmtColumns}
                  rowKey="id"
                  size="small"
                  pagination={{ pageSize: 20, hideOnSinglePage: true, size: "small",
                    showTotal: t => `共 ${t} 条` }}
                  locale={{ emptyText: <Empty description="暂无流水数据，请先导入 CSV" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                  rowClassName={r => r.match_status === "unmatched" ? "" : ""}
                />
              ),
            },
            {
              key: "accounts",
              label: `银行账户 (${accounts.length})`,
              children: (
                <Table
                  dataSource={accounts}
                  columns={accountColumns}
                  rowKey="id"
                  size="small"
                  pagination={{ hideOnSinglePage: true }}
                  locale={{ emptyText: <Empty description="暂无银行账户，点击「添加银行账户」" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
                />
              ),
            },
          ]}
        />
      </Card>

      {/* Add account modal */}
      <Modal
        title={<Space><BankOutlined />添加银行账户</Space>}
        open={addOpen}
        onOk={() => void handleAddAccount()}
        onCancel={() => { setAddOpen(false); form.resetFields(); }}
        okText="添加"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" size="middle" style={{ paddingTop: 8 }}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="bankName" label="银行名称" rules={[{ required: true }]}>
                <Input placeholder="如：招商银行" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="bankCode" label="联行号（可选）">
                <Input placeholder="12位联行号" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="accountNo" label="银行账号" rules={[{ required: true }]}>
            <Input placeholder="银行账号" />
          </Form.Item>
          <Form.Item name="accountName" label="开户名称" rules={[{ required: true }]}>
            <Input placeholder="与银行开户名一致" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={8}>
              <Form.Item name="isPrimary" label="主账户" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="isPayroll" label="工资代发" valuePropName="checked">
                <Switch />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="备注">
            <Input placeholder="可选备注" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
