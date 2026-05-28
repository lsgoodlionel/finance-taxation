import { useState, useMemo } from "react";
import {
  Steps, Button, Card, Table, Tag, Statistic, Alert, DatePicker, Space,
  Row, Col, Divider, Typography, Spin, Empty, Result,
} from "antd";
import {
  CheckCircleOutlined, TeamOutlined, CalculatorOutlined,
  EditOutlined, AuditOutlined, SendOutlined, ReloadOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { toast } from "sonner";
import type { Employee, PayrollRecord, PayrollPolicy, PayrollPeriodSummary } from "@finance-taxation/domain-model";
import { computePayroll, confirmPayroll, listPayroll, syncPayrollReviewLedgers } from "../../lib/api";

const { Text } = Typography;

function fmtAmt(n: number) {
  return n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STEPS = [
  { title: "选择期间", icon: <CheckCircleOutlined /> },
  { title: "员工确认", icon: <TeamOutlined /> },
  { title: "计算预览", icon: <CalculatorOutlined /> },
  { title: "人工调整", icon: <EditOutlined /> },
  { title: "审核确认", icon: <AuditOutlined /> },
  { title: "发放申报", icon: <SendOutlined /> },
];

interface Props {
  employees: Employee[];
  periods: PayrollPeriodSummary[];
  policy: PayrollPolicy | null;
}

export function PayrollRunWizard({ employees, periods, policy }: Props) {
  const [current, setCurrent] = useState(0);
  const [period, setPeriod] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [computing, setComputing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(false);

  const activeEmployees = useMemo(
    () => employees.filter((e) => e.status === "active"),
    [employees],
  );

  const summary = useMemo(() => ({
    headcount: records.length,
    totalGross: records.reduce((s, r) => s + r.grossSalary, 0),
    totalSocialSec: records.reduce((s, r) => s + r.socialSecurityEmployee + r.socialSecurityEmployer, 0),
    totalHousing: records.reduce((s, r) => s + r.housingFundEmployee + r.housingFundEmployer, 0),
    totalIit: records.reduce((s, r) => s + r.iitWithheld, 0),
    totalNet: records.reduce((s, r) => s + r.netPay, 0),
    draftCount: records.filter((r) => r.status === "draft").length,
    confirmedCount: records.filter((r) => r.status === "confirmed").length,
  }), [records]);

  // ── Step 2: load existing or check employees ────────────────────────────
  async function handleNext0() {
    // try loading existing records for this period
    try {
      const res = await listPayroll(period);
      if (res.items.length > 0) {
        setRecords(res.items);
      }
    } catch {
      // no records yet — fine, Step 3 will compute
    }
    setCurrent(1);
  }

  // ── Step 3: compute payroll ─────────────────────────────────────────────
  async function handleCompute() {
    setComputing(true);
    try {
      const res = await computePayroll(period);
      setRecords(res.records);
      toast.success(`已计算 ${res.records.length} 人工资`);
      setCurrent(3);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "计算失败，请重试");
    } finally {
      setComputing(false);
    }
  }

  // ── Step 5: confirm all ─────────────────────────────────────────────────
  async function handleConfirmAll() {
    const drafts = records.filter((r) => r.status === "draft");
    if (drafts.length === 0) { setCurrent(5); return; }
    setConfirming(true);
    try {
      const results = await Promise.allSettled(drafts.map((r) => confirmPayroll(r.id)));
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        toast.error(`${failed} 条确认失败，请检查`);
      } else {
        toast.success(`已确认 ${drafts.length} 条工资记录`);
      }
      // reload
      const res = await listPayroll(period);
      setRecords(res.items);
      setCurrent(5);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "确认失败");
    } finally {
      setConfirming(false);
    }
  }

  // ── Step 6: sync tax ledgers ────────────────────────────────────────────
  async function handleSyncTax() {
    setSyncing(true);
    try {
      await syncPayrollReviewLedgers({ period });
      setSynced(true);
      toast.success("已同步个税及社保数据到税务中心");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "同步失败");
    } finally {
      setSyncing(false);
    }
  }

  // ── Columns ─────────────────────────────────────────────────────────────
  const recordColumns: ColumnsType<PayrollRecord> = [
    { title: "姓名", dataIndex: "employeeName", fixed: "left", width: 90 },
    {
      title: "应发工资",
      dataIndex: "grossSalary",
      width: 110,
      render: (v: number) => <Text strong>¥{fmtAmt(v)}</Text>,
    },
    { title: "个人社保", dataIndex: "socialSecurityEmployee", width: 110, render: (v: number) => `¥${fmtAmt(v)}` },
    { title: "单位社保", dataIndex: "socialSecurityEmployer", width: 110, render: (v: number) => `¥${fmtAmt(v)}` },
    { title: "个人公积金", dataIndex: "housingFundEmployee", width: 110, render: (v: number) => `¥${fmtAmt(v)}` },
    { title: "单位公积金", dataIndex: "housingFundEmployer", width: 110, render: (v: number) => `¥${fmtAmt(v)}` },
    { title: "代扣个税", dataIndex: "iitWithheld", width: 100, render: (v: number) => `¥${fmtAmt(v)}` },
    {
      title: "实发工资",
      dataIndex: "netPay",
      fixed: "right",
      width: 120,
      render: (v: number) => (
        <Text strong style={{ color: "#16a34a" }}>¥{fmtAmt(v)}</Text>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      fixed: "right",
      width: 80,
      render: (v: string) => (
        <Tag color={v === "confirmed" ? "success" : "default"}>
          {v === "confirmed" ? "已确认" : "草稿"}
        </Tag>
      ),
    },
  ];

  const employeeColumns: ColumnsType<Employee> = [
    { title: "姓名", dataIndex: "name" },
    { title: "岗位", dataIndex: "position", render: (v: string) => v || "—" },
    {
      title: "基本工资",
      dataIndex: "baseSalary",
      render: (v: number) => `¥${fmtAmt(v)}`,
    },
    {
      title: "入职日期",
      dataIndex: "hireDate",
      render: (v: string) => v ? dayjs(v).format("YYYY-MM-DD") : "—",
    },
    {
      title: "状态",
      dataIndex: "status",
      render: () => <Tag color="success">在职</Tag>,
    },
  ];

  // ── Summary stat row ─────────────────────────────────────────────────────
  function SummaryRow() {
    return (
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={4}>
          <Statistic title="人数" value={summary.headcount} suffix="人" />
        </Col>
        <Col span={5}>
          <Statistic title="应发合计" value={`¥${fmtAmt(summary.totalGross)}`} valueStyle={{ fontSize: 16 }} />
        </Col>
        <Col span={5}>
          <Statistic title="代扣个税" value={`¥${fmtAmt(summary.totalIit)}`} valueStyle={{ fontSize: 16, color: "#d97706" }} />
        </Col>
        <Col span={5}>
          <Statistic title="社保+公积金" value={`¥${fmtAmt(summary.totalSocialSec + summary.totalHousing)}`} valueStyle={{ fontSize: 16 }} />
        </Col>
        <Col span={5}>
          <Statistic title="实发合计" value={`¥${fmtAmt(summary.totalNet)}`} valueStyle={{ fontSize: 16, color: "#16a34a" }} />
        </Col>
      </Row>
    );
  }

  // ── Step content ─────────────────────────────────────────────────────────
  function renderStep() {
    switch (current) {
      case 0:
        return <Step0 period={period} setPeriod={setPeriod} periods={periods} policy={policy} />;
      case 1:
        return (
          <div>
            <Alert
              type="info"
              showIcon
              message={`本期将参与计算的员工：${activeEmployees.length} 人（在职），基本工资合计 ¥${fmtAmt(activeEmployees.reduce((s, e) => s + e.baseSalary, 0))}`}
              style={{ marginBottom: 16 }}
            />
            <Table
              rowKey="id"
              columns={employeeColumns}
              dataSource={activeEmployees}
              pagination={false}
              size="small"
              scroll={{ x: 600 }}
              locale={{ emptyText: <Empty description="暂无在职员工，请先在员工管理中添加" /> }}
            />
          </div>
        );
      case 2:
        return (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            {records.length > 0 ? (
              <>
                <Alert type="success" showIcon message={`已有 ${records.length} 条工资记录（${period}），可直接进入下一步`} style={{ marginBottom: 24 }} />
                <SummaryRow />
                <Table rowKey="id" columns={recordColumns} dataSource={records} pagination={false} size="small" scroll={{ x: 900 }} />
              </>
            ) : (
              <>
                <div style={{ color: "#64748b", marginBottom: 24 }}>
                  点击下方按钮，系统将根据员工信息和薪酬政策自动计算 {period} 期间工资。
                </div>
                <Button
                  type="primary"
                  icon={<CalculatorOutlined />}
                  size="large"
                  loading={computing}
                  onClick={handleCompute}
                >
                  开始计算
                </Button>
              </>
            )}
          </div>
        );
      case 3:
        return (
          <div>
            <Alert
              type="warning"
              showIcon
              message="如有需要手工调整的项目（奖金/扣款/补发），请直接联系财务后台录入调整记录，系统暂不支持前端调整。"
              style={{ marginBottom: 16 }}
            />
            <SummaryRow />
            <Table rowKey="id" columns={recordColumns} dataSource={records} pagination={false} size="small" scroll={{ x: 900 }} />
          </div>
        );
      case 4:
        return (
          <div>
            <Alert
              type="info"
              showIcon
              message={`待确认：${summary.draftCount} 条 · 已确认：${summary.confirmedCount} 条`}
              style={{ marginBottom: 16 }}
            />
            <SummaryRow />
            <Table rowKey="id" columns={recordColumns} dataSource={records} pagination={false} size="small" scroll={{ x: 900 }} />
            {summary.draftCount > 0 && (
              <div style={{ textAlign: "center", marginTop: 24 }}>
                <Button
                  type="primary"
                  icon={<AuditOutlined />}
                  size="large"
                  loading={confirming}
                  onClick={handleConfirmAll}
                >
                  确认全部 {summary.draftCount} 条
                </Button>
              </div>
            )}
          </div>
        );
      case 5:
        return (
          <div>
            <Result
              status="success"
              title={`${period} 工资已完成审核确认`}
              subTitle={`实发合计 ¥${fmtAmt(summary.totalNet)}，共 ${summary.confirmedCount} 人`}
              extra={[
                <Button
                  key="sync"
                  type="primary"
                  icon={syncing ? <Spin size="small" /> : <ReloadOutlined />}
                  loading={syncing}
                  disabled={synced}
                  onClick={handleSyncTax}
                >
                  {synced ? "已同步个税/社保" : "同步到税务中心"}
                </Button>,
              ]}
            />
            <Divider />
            <SummaryRow />
            <Table rowKey="id" columns={recordColumns} dataSource={records} pagination={false} size="small" scroll={{ x: 900 }} />
          </div>
        );
      default:
        return null;
    }
  }

  const canNext = (() => {
    if (current === 1 && activeEmployees.length === 0) return false;
    if (current === 2 && records.length === 0) return false;
    return true;
  })();

  function handleNavNext() {
    if (current === 0) { void handleNext0(); return; }
    if (current === 4) { void handleConfirmAll(); return; }
    setCurrent((c) => Math.min(c + 1, STEPS.length - 1));
  }

  function handleNavPrev() {
    setCurrent((c) => Math.max(c - 1, 0));
  }

  return (
    <Card
      title={<span style={{ fontWeight: 700 }}>工资计算向导 — {period}</span>}
      extra={<Text type="secondary" style={{ fontSize: 12 }}>按步骤完成本期工资计算与确认</Text>}
      styles={{ body: { padding: "24px 28px" } }}
    >
      <Steps
        current={current}
        items={STEPS}
        size="small"
        style={{ marginBottom: 32 }}
      />

      <div style={{ minHeight: 240 }}>
        {renderStep()}
      </div>

      <Divider style={{ margin: "24px 0 16px" }} />
      <Space>
        {current > 0 && (
          <Button onClick={handleNavPrev} disabled={confirming || computing}>
            上一步
          </Button>
        )}
        {current < STEPS.length - 1 && current !== 2 && current !== 4 && (
          <Button
            type="primary"
            onClick={handleNavNext}
            disabled={!canNext || computing || confirming}
          >
            下一步
          </Button>
        )}
        {current === 2 && records.length > 0 && (
          <Button type="primary" onClick={() => setCurrent(3)}>
            下一步（跳过重算）
          </Button>
        )}
        {current === STEPS.length - 1 && (
          <Button
            onClick={() => {
              setCurrent(0);
              setRecords([]);
              setSynced(false);
              const d = new Date();
              setPeriod(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
            }}
          >
            开始新一期
          </Button>
        )}
      </Space>
    </Card>
  );
}

// ── Step 0 subcomponent ──────────────────────────────────────────────────────
function Step0({
  period,
  setPeriod,
  periods,
  policy,
}: {
  period: string;
  setPeriod: (v: string) => void;
  periods: PayrollPeriodSummary[];
  policy: PayrollPolicy | null;
}) {
  const recentPeriods = periods.slice(0, 6);
  return (
    <Row gutter={32}>
      <Col span={12}>
        <div style={{ marginBottom: 24 }}>
          <Text strong>选择计算期间</Text>
          <div style={{ marginTop: 8 }}>
            <DatePicker
              picker="month"
              value={period ? dayjs(period, "YYYY-MM") : null}
              onChange={(d) => { if (d) setPeriod(d.format("YYYY-MM")); }}
              format="YYYY年MM月"
              placeholder="选择年月"
              style={{ width: "100%" }}
              allowClear={false}
            />
          </div>
        </div>
        {recentPeriods.length > 0 && (
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>历史期间（点击快速选择）：</Text>
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {recentPeriods.map((p) => (
                <Tag
                  key={p.period}
                  color={p.period === period ? "blue" : "default"}
                  style={{ cursor: "pointer" }}
                  onClick={() => setPeriod(p.period)}
                >
                  {p.period}
                  <span style={{ marginLeft: 4, fontSize: 10 }}>
                    {p.status === "confirmed" ? "✓" : "草稿"}
                  </span>
                </Tag>
              ))}
            </div>
          </div>
        )}
      </Col>
      <Col span={12}>
        {policy && (
          <Card size="small" title="当前薪酬政策" style={{ background: "#f8fafc" }}>
            <Row gutter={8}>
              <Col span={12}><Text type="secondary" style={{ fontSize: 12 }}>个税起征点：</Text><Text strong>¥{policy.iitThreshold.toLocaleString()}</Text></Col>
              <Col span={12}><Text type="secondary" style={{ fontSize: 12 }}>养老（个人）：</Text><Text strong>{(policy.pensionEmployeeRate * 100).toFixed(0)}%</Text></Col>
              <Col span={12}><Text type="secondary" style={{ fontSize: 12 }}>医疗（个人）：</Text><Text strong>{(policy.medicalEmployeeRate * 100).toFixed(0)}%</Text></Col>
              <Col span={12}><Text type="secondary" style={{ fontSize: 12 }}>住房公积金（个人）：</Text><Text strong>{(policy.housingFundEmployeeRate * 100).toFixed(0)}%</Text></Col>
            </Row>
          </Card>
        )}
      </Col>
    </Row>
  );
}
