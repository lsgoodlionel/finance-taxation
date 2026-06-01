import { Table, Tag, Typography, Button, Space } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { BusinessEvent, RiskFinding } from "@finance-taxation/domain-model";
import { buildRiskDrilldownTargets } from "../drilldown";

const { Text } = Typography;

const SEVERITY_COLOR: Record<string, string> = {
  high: "error",
  medium: "warning",
  low: "processing",
};

const STATUS_COLOR: Record<string, string> = {
  open: "orange",
  resolved: "success",
  dismissed: "default",
};

type RiskFindingsListPanelProps = {
  findings: RiskFinding[];
  eventMap: Map<string, BusinessEvent>;
  navEventId: string | null;
  selectedFindingId: string;
  severityLabel: (severity: RiskFinding["severity"]) => string;
  priorityLabel: (priority: NonNullable<RiskFinding["priority"]>) => string;
  statusLabel: (status: RiskFinding["status"]) => string;
  onSelectFinding: (findingId: string) => void;
  onNavigate: (path: string, state?: Record<string, string>) => void;
};

export function RiskFindingsListPanel({
  findings,
  eventMap,
  navEventId,
  selectedFindingId,
  severityLabel,
  priorityLabel,
  statusLabel,
  onSelectFinding,
  onNavigate,
}: RiskFindingsListPanelProps) {
  const columns: ColumnsType<RiskFinding> = [
    {
      title: "严重级别",
      dataIndex: "severity",
      key: "severity",
      width: 80,
      filters: [
        { text: "高危", value: "high" },
        { text: "中危", value: "medium" },
        { text: "低危", value: "low" },
      ],
      onFilter: (value, record) => record.severity === value,
      render: (v: RiskFinding["severity"]) => (
        <Tag color={SEVERITY_COLOR[v] ?? "default"}>{severityLabel(v)}</Tag>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 80,
      filters: [
        { text: "待处理", value: "open" },
        { text: "已关闭", value: "resolved" },
        { text: "已忽略", value: "dismissed" },
      ],
      onFilter: (value, record) => record.status === value,
      render: (v: RiskFinding["status"]) => (
        <Tag color={STATUS_COLOR[v] ?? "default"}>{statusLabel(v)}</Tag>
      ),
    },
    {
      title: "规则 / 标题",
      key: "title",
      render: (_, row) => (
        <div>
          <Text type="secondary" style={{ fontSize: 11 }}>{row.ruleCode}</Text>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{row.title}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>{row.detail}</Text>
        </div>
      ),
    },
    {
      title: "评分",
      dataIndex: "score",
      key: "score",
      width: 60,
      align: "center",
      render: (v: number | undefined) => (
        <Text style={{ fontWeight: 600, color: v && v >= 70 ? "#dc2626" : v && v >= 40 ? "#d97706" : "#64748b" }}>
          {v ?? "—"}
        </Text>
      ),
    },
    {
      title: "优先级",
      dataIndex: "priority",
      key: "priority",
      width: 70,
      align: "center",
      render: (v: RiskFinding["priority"]) =>
        v ? <Tag>{priorityLabel(v)}</Tag> : <Text type="secondary">—</Text>,
    },
    {
      title: "操作",
      key: "action",
      width: 120,
      render: (_, row) => {
        const linkedEvent = row.businessEventId ? eventMap.get(row.businessEventId) ?? null : null;
        const targets = buildRiskDrilldownTargets(linkedEvent);
        const isSelected = selectedFindingId === row.id;
        return (
          <Space direction="vertical" size={4}>
            <Button
              type={isSelected ? "primary" : "default"}
              size="small"
              onClick={() => onSelectFinding(row.id)}
            >
              {isSelected ? "当前复盘" : "查看复盘"}
            </Button>
            {targets.map((target) => (
              <Button
                key={`${row.id}-${target.path}-${target.label}`}
                size="small"
                type="link"
                style={{ padding: 0, height: "auto", fontSize: 11 }}
                onClick={() => onNavigate(target.path, target.state)}
              >
                {target.label}
              </Button>
            ))}
          </Space>
        );
      },
    },
  ];

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.82)",
        borderRadius: 24,
        border: "1px solid rgba(20,40,60,0.08)",
        padding: 24,
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: 16 }}>
        风险发现{navEventId ? `（当前事项 ${navEventId}）` : ""}
        {findings.length > 0 && (
          <Text type="secondary" style={{ fontWeight: 400, fontSize: 13, marginLeft: 8 }}>
            共 {findings.length} 条
          </Text>
        )}
      </h3>
      <Table<RiskFinding>
        dataSource={findings}
        columns={columns}
        rowKey="id"
        size="small"
        pagination={{ pageSize: 15, showSizeChanger: false, hideOnSinglePage: true }}
        rowClassName={(row) => (row.id === selectedFindingId ? "ant-table-row-selected" : "")}
        locale={{ emptyText: "当前筛选范围内暂无风险发现" }}
        style={{ fontSize: 13 }}
      />
    </div>
  );
}
