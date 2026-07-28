/**
 * 银行管理页面（P1 + P3 对账）
 * 路由：/banking
 * 功能：
 *   - 银行账户管理（多账户）
 *   - 银行流水导入（CSV）
 *   - 流水列表 + 对账状态
 *   - 未匹配汇总
 *   - 智能对账：运行对账引擎、候选确认/驳回、对账规则配置
 */
import { useState, useEffect, useCallback } from "react";
import {
  Typography, Card, Row, Col, Button, Space, Table, Upload, Alert,
  Statistic, Tabs, Form, Empty, Skeleton, Select,
} from "antd";
import {
  BankOutlined, UploadOutlined, CheckCircleOutlined, ClockCircleOutlined,
  PlusOutlined, SyncOutlined, RobotOutlined,
} from "@ant-design/icons";
import { toast } from "sonner";
import type { RcFile } from "antd/es/upload";
import {
  listBankAccounts, createBankAccount, listBankStatements, importBankStatements,
  getBankUnmatchedSummary,
  runBankReconciliation, listReconciliationCandidates,
  confirmReconciliationCandidate, rejectReconciliationCandidate,
  getReconciliationRules, updateReconciliationRules,
  type BankAccount, type BankStatement, type ReconciliationCandidate,
} from "../../lib/api";
import { BankingAccountModal } from "./BankingAccountModal";
import { buildAccountColumns, buildCandidateColumns, buildStatementColumns } from "./banking-columns";
import { BankingReconciliationTab } from "./BankingReconciliationTab";

const { Text } = Typography;


export function BankingPage() {
  const [accounts, setAccounts]     = useState<BankAccount[]>([]);
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [candidates, setCandidates] = useState<ReconciliationCandidate[]>([]);
  const [summary, setSummary]       = useState<Record<string, { count: number; totalAmount: number }>>({});
  const [loading, setLoading]       = useState(true);
  const [importing, setImporting]   = useState(false);
  const [running, setRunning]       = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [addOpen, setAddOpen]       = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>(undefined);
  const [form] = Form.useForm();
  const [rulesForm] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [accs, stmts, smry, candidateRes, ruleRes] = await Promise.all([
        listBankAccounts(),
        listBankStatements({ pageSize: 50 }),
        getBankUnmatchedSummary(),
        listReconciliationCandidates("pending"),
        getReconciliationRules(),
      ]);
      setAccounts(accs.items);
      setStatements(stmts.items);
      setSummary(smry);
      setCandidates(candidateRes.items);
      rulesForm.setFieldsValue(ruleRes);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [rulesForm]);

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

  async function handleRunReconciliation() {
    setRunning(true);
    try {
      const result = await runBankReconciliation();
      toast.success(`对账完成：自动匹配 ${result.matched}，建议确认 ${result.suggested}，未匹配 ${result.unmatched}`);
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  async function handleConfirmCandidate(id: string) {
    try {
      await confirmReconciliationCandidate(id);
      toast.success("候选已确认");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function handleRejectCandidate(id: string) {
    try {
      await rejectReconciliationCandidate(id);
      toast.success("候选已驳回");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function handleSaveRules() {
    const values = await rulesForm.validateFields();
    setSavingRules(true);
    try {
      await updateReconciliationRules(values);
      toast.success("对账规则已保存");
      await load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingRules(false);
    }
  }

  const unmatchedCount = summary.unmatched?.count ?? 0;
  const autoCount      = summary.auto?.count ?? 0;
  const pendingCandidateCount = candidates.length;

  const accountColumns = buildAccountColumns();
  const stmtColumns = buildStatementColumns();
  const candidateColumns = buildCandidateColumns({
    onConfirm: (candidateId) => void handleConfirmCandidate(candidateId),
    onReject: (candidateId) => void handleRejectCandidate(candidateId),
  });

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <Skeleton active paragraph={{ rows: 6 }} />
      </div>
    );
  }

  return (
    // V10：页头与业务链路条已上交 /bills 容器，这里只留「关键数字」与「工作区」两块。
    // 添加账户 / 刷新两个动作并入工作区卡的页签栏右侧，不再单独占一行页头。
    <div style={{ display: "grid", gap: 16 }}>
      {/* 关键数字：紧凑一条，替代原来四张大 KPI 卡 */}
      <Card style={{ borderRadius: 12 }} styles={{ body: { padding: "12px 20px" } }}>
        <Row gutter={[16, 12]}>
          <Col xs={12} lg={6}>
            <Statistic title="银行账户数" value={accounts.length} prefix={<BankOutlined />}
              valueStyle={{ fontSize: 18, color: "#2563eb" }} />
          </Col>
          <Col xs={12} lg={6}>
            <Statistic title="未对账流水" value={unmatchedCount} prefix={<ClockCircleOutlined />}
              valueStyle={{ fontSize: 18, color: unmatchedCount > 0 ? "#d97706" : "#64748b" }} />
          </Col>
          <Col xs={12} lg={6}>
            <Statistic title="自动匹配成功" value={autoCount} prefix={<CheckCircleOutlined />}
              valueStyle={{ fontSize: 18, color: "#16a34a" }} />
          </Col>
          <Col xs={12} lg={6}>
            <Statistic title="待确认候选" value={pendingCandidateCount} prefix={<RobotOutlined />}
              valueStyle={{ fontSize: 18, color: pendingCandidateCount > 0 ? "#7c3aed" : "#64748b" }} />
          </Col>
        </Row>
      </Card>

      {/* 工作区：导入 / 流水 / 对账 / 账户四个步骤，动作挂在页签栏右侧 */}
      <Card style={{ borderRadius: 12 }}>
        <Tabs
          tabBarExtraContent={(
            <Space wrap>
              <Button icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>添加银行账户</Button>
              <Button icon={<SyncOutlined />} onClick={() => void load()}>刷新</Button>
            </Space>
          )}
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
                />
              ),
            },
            {
              key: "reconciliation",
              label: `智能对账 (${pendingCandidateCount})`,
              children: (
                <BankingReconciliationTab
                  rulesForm={rulesForm}
                  candidates={candidates}
                  candidateColumns={candidateColumns}
                  unmatchedCount={unmatchedCount}
                  pendingCandidateCount={pendingCandidateCount}
                  autoCount={autoCount}
                  savingRules={savingRules}
                  running={running}
                  onSaveRules={() => void handleSaveRules()}
                  onRunReconciliation={() => void handleRunReconciliation()}
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

      <BankingAccountModal
        form={form}
        open={addOpen}
        onSubmit={() => void handleAddAccount()}
        onCancel={() => { setAddOpen(false); form.resetFields(); }}
      />
    </div>
  );
}
