/**
 * H2 异常扫描
 * 展示规则型异常检测结果（重复付款/断号发票/周末大额/税负突变），
 * 与风险发现合流，供人工复核，不做自动处理。
 */
import { useCallback, useEffect, useState } from "react";
import { Alert, Card, DatePicker, Empty, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { getAnomalyScan, type AnomalyFinding } from "../../lib/api";
import { usePeriod } from "../../lib/period-context";

const { Text, Title } = Typography;

type AnomalySeverity = AnomalyFinding["severity"];

const SEVERITY_META: Record<AnomalySeverity, { color: string; label: string }> = {
  alert: { color: "red", label: "严重" },
  warning: { color: "gold", label: "警示" },
  info: { color: "blue", label: "提示" }
};

const SEVERITY_ORDER: AnomalySeverity[] = ["alert", "warning", "info"];

function buildColumns(): ColumnsType<AnomalyFinding> {
  return [
    {
      title: "级别",
      dataIndex: "severity",
      key: "severity",
      width: 90,
      align: "center",
      render: (severity: AnomalySeverity) => <Tag color={SEVERITY_META[severity].color}>{SEVERITY_META[severity].label}</Tag>
    },
    { title: "类型", dataIndex: "kind", key: "kind", width: 160 },
    { title: "标题", dataIndex: "title", key: "title" },
    { title: "详情", dataIndex: "detail", key: "detail" },
    {
      title: "关联",
      dataIndex: "refs",
      key: "refs",
      width: 220,
      render: (refs: string[]) =>
        refs.length > 0 ? (
          <Space direction="vertical" size={2}>
            {refs.map((ref) => (
              <Text key={ref} type="secondary" style={{ fontSize: "12px" }} code>
                {ref}
              </Text>
            ))}
          </Space>
        ) : (
          <Text type="secondary">—</Text>
        )
    }
  ];
}

const COLUMNS = buildColumns();

export function AnomalyScanPanel() {
  const { period: globalPeriod } = usePeriod();
  const [period, setPeriod] = useState(globalPeriod);
  const [findings, setFindings] = useState<AnomalyFinding[]>([]);
  const [bySeverity, setBySeverity] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setPeriod(globalPeriod);
  }, [globalPeriod]);

  const load = useCallback(async (targetPeriod: string) => {
    setLoading(true);
    setError("");
    try {
      const data = await getAnomalyScan(targetPeriod || undefined);
      setFindings(data.findings);
      setBySeverity(data.bySeverity);
    } catch (err) {
      const msg = (err as Error).message || "异常扫描加载失败";
      setError(msg);
      setFindings([]);
      setBySeverity({});
      void message.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(period);
  }, [load, period]);

  return (
    <Card
      title={<Title level={5} style={{ margin: 0 }}>异常扫描</Title>}
      extra={
        <DatePicker
          picker="month"
          size="small"
          allowClear
          value={period ? dayjs(`${period}-01`) : null}
          format="YYYY-MM"
          placeholder="全部属期"
          onChange={(d) => setPeriod(d ? d.format("YYYY-MM") : "")}
          aria-label="异常扫描属期"
        />
      }
      style={{ borderRadius: "24px" }}
      loading={loading && findings.length === 0 && !error}
    >
      <Space direction="vertical" size={14} style={{ width: "100%" }}>
        <Alert
          type="info"
          showIcon
          message="规则型异常检测（重复付款/断号发票/周末大额/税负突变），供人工复核"
        />

        {error ? <Alert type="error" showIcon message="加载失败" description={error} /> : null}

        <Space size={8} wrap>
          {SEVERITY_ORDER.map((severity) => (
            <Tag key={severity} color={SEVERITY_META[severity].color} style={{ margin: 0 }}>
              {SEVERITY_META[severity].label} {bySeverity[severity] ?? 0}
            </Tag>
          ))}
        </Space>

        <Table<AnomalyFinding>
          rowKey={(record, index) => `${record.kind}-${index}`}
          size="small"
          columns={COLUMNS}
          dataSource={findings}
          pagination={findings.length > 10 ? { pageSize: 10, size: "small" } : false}
          locale={{
            emptyText: loading ? "加载中…" : <Empty description="未发现异常" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          }}
        />
      </Space>
    </Card>
  );
}
