/**
 * F1 票税一致性比对
 * 展示某属期「发票值 / 对比值（账面或申报）」的三项分级比对结果，
 * 并在申报数据尚未接入时给出明确提示。
 */
import { useCallback, useEffect, useState } from "react";
import { Alert, Card, DatePicker, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { getTaxConsistency, type ConsistencySeverity, type TaxConsistencyCheck, type TaxConsistencyReport } from "../../lib/api";
import { usePeriod } from "../../lib/period-context";

const { Text, Title } = Typography;

const SEVERITY_META: Record<ConsistencySeverity, { color: string; label: string; alertType: "success" | "warning" | "error" }> = {
  ok: { color: "success", label: "一致", alertType: "success" },
  warning: { color: "warning", label: "存疑", alertType: "warning" },
  alert: { color: "error", label: "异常", alertType: "error" }
};

function formatYuan(cents: number): string {
  return `￥${(cents / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildColumns(): ColumnsType<TaxConsistencyCheck> {
  return [
    { title: "比对项", dataIndex: "label", key: "label" },
    {
      title: "发票值",
      dataIndex: "invoiceValueCents",
      key: "invoiceValueCents",
      align: "right",
      render: (value: number) => formatYuan(value)
    },
    {
      title: "对比值",
      dataIndex: "comparedValueCents",
      key: "comparedValueCents",
      align: "right",
      render: (value: number) => formatYuan(value)
    },
    {
      title: "差异",
      dataIndex: "differenceCents",
      key: "differenceCents",
      align: "right",
      render: (value: number) => (
        <Text type={value === 0 ? "secondary" : value > 0 ? "danger" : "warning"}>
          {value > 0 ? "+" : ""}
          {formatYuan(value)}
        </Text>
      )
    },
    {
      title: "级别",
      dataIndex: "severity",
      key: "severity",
      align: "center",
      render: (severity: ConsistencySeverity) => <Tag color={SEVERITY_META[severity].color}>{SEVERITY_META[severity].label}</Tag>
    }
  ];
}

const COLUMNS = buildColumns();

export function TaxConsistencyPanel() {
  const { period: globalPeriod } = usePeriod();
  const [period, setPeriod] = useState(globalPeriod);
  const [report, setReport] = useState<TaxConsistencyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setPeriod(globalPeriod);
  }, [globalPeriod]);

  const load = useCallback(async (targetPeriod: string) => {
    if (!targetPeriod) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await getTaxConsistency(targetPeriod);
      setReport(data);
    } catch (err) {
      const msg = (err as Error).message || "票税一致性比对加载失败";
      setError(msg);
      setReport(null);
      void message.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(period);
  }, [load, period]);

  const overall = report?.overall;

  return (
    <Card
      title={<Title level={5} style={{ margin: 0 }}>票税一致性比对</Title>}
      extra={
        <DatePicker
          picker="month"
          size="small"
          allowClear={false}
          value={period ? dayjs(`${period}-01`) : null}
          format="YYYY-MM"
          onChange={(d) => { if (d) setPeriod(d.format("YYYY-MM")); }}
          aria-label="票税比对属期"
        />
      }
      style={{ borderRadius: "24px" }}
      loading={loading && !report}
    >
      <Space direction="vertical" size={14} style={{ width: "100%" }}>
        {error ? <Alert type="error" showIcon message="加载失败" description={error} /> : null}

        {report && overall ? (
          <Alert
            type={SEVERITY_META[overall].alertType}
            showIcon
            message={`属期 ${report.period} 整体比对结果：${SEVERITY_META[overall].label}`}
          />
        ) : null}

        {report && !report.declaredDataAvailable ? (
          <Alert
            type="info"
            showIcon
            message="申报数据未接入"
            description={
              <div>
                <div>当前申报值暂按 0 计算，比对结果仅供参考，待税务申报数据接入后将自动更新。</div>
                {report.notes.length > 0 ? (
                  <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                    {report.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            }
          />
        ) : null}

        <Table<TaxConsistencyCheck>
          rowKey="key"
          size="small"
          columns={COLUMNS}
          dataSource={report?.checks ?? []}
          pagination={false}
          locale={{ emptyText: loading ? "加载中…" : "暂无比对数据" }}
        />
      </Space>
    </Card>
  );
}
