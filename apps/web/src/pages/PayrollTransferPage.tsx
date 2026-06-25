/**
 * 工资代发与社保工作台（P3 代发批次 + P4 社保关账）
 * route: /payroll/transfer
 * 采用 V3 hero/section 壳层风格（对齐总账中心）。
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card, Button, Table, Input, Tag, Space, Typography, Statistic, Row, Col,
  Alert, Spin, Divider, Popconfirm, message as antdMessage,
} from "antd";
import {
  BankOutlined, FileDoneOutlined, DownloadOutlined, CheckCircleOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import { toast } from "sonner";
import { PageHeader } from "../components/ui/PageHeader";
import { WorkflowRuntimeCard } from "../components/workflow/WorkflowRuntimeCard";
import { SalaryAccountDrawer } from "./payroll-transfer/SalaryAccountDrawer";
import { usePeriod } from "../lib/period-context";
import {
  listTransferBatches, getTransferBatch, buildTransferBatch, approveTransferBatch,
  disburseTransferBatch, downloadTransferFile, closeSocialSecurity,
  type PayrollTransferBatch, type PayrollTransferLine, type WorkflowRunDetail,
} from "../lib/api";

const { Text } = Typography;

const STATUS_TAG: Record<string, { color: string; label: string }> = {
  draft:     { color: "default",    label: "草稿" },
  approved:  { color: "blue",       label: "已审批" },
  exported:  { color: "geekblue",   label: "已导出" },
  disbursed: { color: "green",      label: "已代发" },
  confirmed: { color: "success",    label: "已对账" },
};

export function PayrollTransferPage() {
  const navigate = useNavigate();
  const { period: globalPeriod } = usePeriod();
  const [batches, setBatches] = useState<PayrollTransferBatch[]>([]);
  const [selected, setSelected] = useState<{ batch: PayrollTransferBatch; lines: PayrollTransferLine[] } | null>(null);
  const [runtimeDetail, setRuntimeDetail] = useState<WorkflowRunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [genPeriod, setGenPeriod] = useState(globalPeriod);
  const [ssPeriod, setSsPeriod] = useState(globalPeriod);

  // 全局期间变化时同步页内默认期间
  useEffect(() => { setGenPeriod(globalPeriod); setSsPeriod(globalPeriod); }, [globalPeriod]);
  const [ssResult, setSsResult] = useState<string | null>(null);
  const [acctOpen, setAcctOpen] = useState(false);

  const loadBatches = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listTransferBatches();
      setBatches(data.items);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadBatches(); }, [loadBatches]);

  async function selectBatch(id: string) {
    try {
      setSelected(await getTransferBatch(id));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function handleGenerate() {
    if (!/^\d{4}-\d{2}$/.test(genPeriod)) { toast.error("期间格式应为 YYYY-MM"); return; }
    setBusy(true);
    try {
      const r = await buildTransferBatch(genPeriod);
      toast.success(`已生成 ${genPeriod} 代发批次：${r.employeeCount} 人，合计 ¥${r.totalAmount.toFixed(2)}${r.skipped ? `，${r.skipped} 人缺账号跳过` : ""}`);
      await loadBatches();
      await selectBatch(r.batchId);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleApprove() {
    if (!selected) return;
    setBusy(true);
    try {
      await approveTransferBatch(selected.batch.id);
      toast.success("批次已审批");
      await loadBatches(); await selectBatch(selected.batch.id);
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  }

  async function handleDownload(format: "generic" | "cmb") {
    if (!selected) return;
    try {
      const blob = await downloadTransferFile(selected.batch.id, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${format === "cmb" ? "招行代发" : "工资代发"}_${selected.batch.payroll_period}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      await loadBatches(); await selectBatch(selected.batch.id);
    } catch (err) { toast.error((err as Error).message); }
  }

  async function handleDisburse() {
    if (!selected) return;
    setBusy(true);
    try {
      const r = await disburseTransferBatch(selected.batch.id);
      toast.success(`已标记代发完成，联动生成经营事项 ${r.eventId}`);
      await loadBatches(); await selectBatch(selected.batch.id);
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  }

  async function handleSsClose() {
    if (!/^\d{4}-\d{2}$/.test(ssPeriod)) { toast.error("期间格式应为 YYYY-MM"); return; }
    setBusy(true); setSsResult(null);
    try {
      const r = await closeSocialSecurity(ssPeriod);
      const s = r.summary;
      const total = s.socialSecurityEmployer + s.socialSecurityEmployee + s.housingFundEmployer + s.housingFundEmployee;
      setSsResult(`✅ ${ssPeriod} 社保关账完成：三险一金合计 ¥${total.toFixed(2)}，已生成 ${r.voucherIds.length} 张凭证草稿（计提+缴纳）、社保申报事项与任务。`);
      toast.success("社保关账完成，已生成三险一金凭证");
    } catch (err) {
      antdMessage.error((err as Error).message);
      setSsResult(`❌ ${(err as Error).message}`);
    } finally { setBusy(false); }
  }

  async function handleRuntimeChanged() {
    await loadBatches();
    if (selected?.batch.id) {
      await selectBatch(selected.batch.id);
    }
  }

  const totalAmount = batches.reduce((s, b) => s + Number(b.total_amount), 0);
  const disbursedCount = batches.filter(b => b.status === "disbursed" || b.status === "confirmed").length;
  const st = selected?.batch.status;

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}><Spin /></div>;

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section className="v3-hero-shell">
        <PageHeader title="工资代发与社保" subtitle="生成银行代发文件、推进代发流程，并在工资关账后一键生成社保申报与三险一金凭证。"
          actions={<Button onClick={() => setAcctOpen(true)}>维护工资账号</Button>} />
      </section>

      <section className="v3-section-shell" data-tone="accent">
        <Row gutter={16}>
          <Col span={8}><Statistic title="代发批次" value={batches.length} prefix={<FileDoneOutlined />} /></Col>
          <Col span={8}><Statistic title="累计代发金额" value={totalAmount} precision={2} prefix="¥" /></Col>
          <Col span={8}><Statistic title="已代发批次" value={disbursedCount} valueStyle={{ color: "#16a34a" }} /></Col>
        </Row>
      </section>

      <WorkflowRuntimeCard
        title="工资代发运行态 / 授权态"
        resourceType="payroll"
        resourceId={selected?.batch.id ?? batches[0]?.id ?? null}
        emptyHint="选择代发批次后，可查看该批次的运行状态、授权状态、重试与补偿信息。"
        onChanged={() => handleRuntimeChanged()}
        onDetailChange={setRuntimeDetail}
      />

      <div className="v3-result-grid v3-result-grid--wide">
        {/* 左：批次列表 + 生成 */}
        <div className="v3-workbench-card">
          <section className="v3-section-shell">
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              <Space.Compact style={{ width: "100%" }}>
                <Input addonBefore="期间" value={genPeriod} onChange={e => setGenPeriod(e.target.value)} placeholder="YYYY-MM" />
                <Button type="primary" loading={busy} icon={<BankOutlined />} onClick={() => void handleGenerate()}>生成代发批次</Button>
              </Space.Compact>
              <Table<PayrollTransferBatch>
                size="small" rowKey="id" dataSource={batches} pagination={false}
                onRow={(r) => ({ onClick: () => void selectBatch(r.id), style: { cursor: "pointer", background: r.id === selected?.batch.id ? "rgba(79,142,247,0.08)" : undefined } })}
                columns={[
                  { title: "期间", dataIndex: "payroll_period" },
                  { title: "人数", dataIndex: "employee_count", align: "center" },
                  { title: "金额", dataIndex: "total_amount", align: "right", render: (v) => `¥${Number(v).toFixed(2)}` },
                  { title: "状态", dataIndex: "status", render: (s) => <Tag color={STATUS_TAG[s]?.color}>{STATUS_TAG[s]?.label ?? s}</Tag> },
                ]}
                locale={{ emptyText: "暂无代发批次，输入期间生成" }}
              />
            </Space>
          </section>
        </div>

        {/* 右：批次详情 + 社保关账 */}
        <div className="v3-workbench-card">
          <section className="v3-section-shell">
            <Space direction="vertical" size={16} style={{ width: "100%" }}>
              {selected ? (
                <Card size="small" title={<Space><FileDoneOutlined />{selected.batch.payroll_period} 代发批次 <Tag color={STATUS_TAG[st!]?.color}>{STATUS_TAG[st!]?.label}</Tag></Space>}
                  extra={selected.batch.bank_transfer_ref && <Text type="secondary" style={{ fontSize: 12 }}>批次号 {selected.batch.bank_transfer_ref}</Text>}>
                  {runtimeDetail?.run.blockedReason ? (
                    <Alert
                      style={{ marginBottom: 12 }}
                      type="error"
                      showIcon
                      message="运行阻塞"
                      description={runtimeDetail.run.blockedReason}
                    />
                  ) : null}
                  {runtimeDetail?.commands[0]?.lastErrorDetail || runtimeDetail?.compensations.length ? (
                    <Alert
                      style={{ marginBottom: 12 }}
                      type="warning"
                      showIcon
                      message={runtimeDetail?.commands[0]?.lastErrorCode || "运行提示"}
                      description={`${runtimeDetail?.commands[0]?.lastErrorDetail || "已存在人工补偿记录"}${runtimeDetail?.compensations.length ? `；补偿 ${runtimeDetail.compensations.length} 条` : ""}`}
                    />
                  ) : null}
                  <Space wrap style={{ marginBottom: 12 }}>
                    <Button size="small" onClick={() => navigate("/payroll", { state: { payrollPeriod: selected.batch.payroll_period, tab: "payroll" } })}>
                      查看工资页
                    </Button>
                    <Button size="small" onClick={() => navigate("/audit", { state: { resourceType: "payroll", resourceId: selected.batch.id, payrollPeriod: selected.batch.payroll_period } })}>
                      查看审计
                    </Button>
                  </Space>
                  <Table<PayrollTransferLine>
                    size="small" rowKey="id" dataSource={selected.lines} pagination={false} style={{ marginBottom: 12 }}
                    columns={[
                      { title: "姓名", dataIndex: "employee_name" },
                      { title: "账号", dataIndex: "salary_account", render: (v, r) => r.status === "skipped" ? <Tag color="orange">缺账号</Tag> : <Text style={{ fontSize: 12 }}>{v}</Text> },
                      { title: "开户行", dataIndex: "salary_bank" },
                      { title: "实发", dataIndex: "amount", align: "right", render: (v) => `¥${Number(v).toFixed(2)}` },
                    ]}
                  />
                  <Space wrap>
                    {st === "draft" && <Button type="primary" loading={busy} onClick={() => void handleApprove()}>审批</Button>}
                    {(st === "approved" || st === "exported" || st === "disbursed") && (
                      <>
                        <Button icon={<DownloadOutlined />} onClick={() => void handleDownload("generic")}>导出通用CSV</Button>
                        <Button icon={<DownloadOutlined />} onClick={() => void handleDownload("cmb")}>导出招行格式</Button>
                      </>
                    )}
                    {st === "exported" && (
                      <Popconfirm title="确认银行已代发完成？将联动生成经营事项" onConfirm={() => void handleDisburse()}>
                        <Button type="primary" icon={<CheckCircleOutlined />} loading={busy}>标记已代发</Button>
                      </Popconfirm>
                    )}
                  </Space>
                </Card>
              ) : (
                <Alert type="info" showIcon message="从左侧选择代发批次查看明细与操作，或先生成新批次。" />
              )}

              <Divider style={{ margin: "4px 0" }} />

              {/* 社保关账 */}
              <Card size="small" title={<Space><SafetyCertificateOutlined style={{ color: "#7c3aed" }} />社保关账（三险一金凭证自动化）</Space>}>
                <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
                  对已全部确认的工资期间关账，自动生成社保申报事项/任务 + 计提与缴纳凭证草稿。
                </Text>
                <Space.Compact style={{ width: "100%" }}>
                  <Input addonBefore="期间" value={ssPeriod} onChange={e => setSsPeriod(e.target.value)} placeholder="YYYY-MM" />
                  <Popconfirm title={`确认对 ${ssPeriod} 关账并生成三险一金凭证？`} onConfirm={() => void handleSsClose()}>
                    <Button type="primary" loading={busy} icon={<SafetyCertificateOutlined />}>社保关账</Button>
                  </Popconfirm>
                </Space.Compact>
                {ssResult && (
                  <Alert style={{ marginTop: 12 }} type={ssResult.startsWith("✅") ? "success" : "error"} message={ssResult} />
                )}
              </Card>
            </Space>
          </section>
        </div>
      </div>

      <SalaryAccountDrawer
        open={acctOpen}
        onClose={() => setAcctOpen(false)}
        onSaved={() => { if (selected) void selectBatch(selected.batch.id); }}
      />
    </div>
  );
}
