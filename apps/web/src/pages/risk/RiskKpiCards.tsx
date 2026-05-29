import { Card, Col, Row, Statistic, Typography } from "antd";
import {
  WarningOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
} from "@ant-design/icons";
import type { RiskFinding } from "@finance-taxation/domain-model";

const { Text } = Typography;

interface Props {
  findings: RiskFinding[];
}

const SEVERITY_CONFIG = {
  high: { label: "高危", color: "#dc2626", bg: "#fef2f2", border: "#fecaca", icon: <WarningOutlined /> },
  medium: { label: "中危", color: "#d97706", bg: "#fffbeb", border: "#fde68a", icon: <ExclamationCircleOutlined /> },
  low: { label: "低危", color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe", icon: <InfoCircleOutlined /> },
} as const;

export function RiskKpiCards({ findings }: Props) {
  const highCount = findings.filter((f) => f.severity === "high").length;
  const mediumCount = findings.filter((f) => f.severity === "medium").length;
  const lowCount = findings.filter((f) => f.severity === "low").length;
  const openCount = findings.filter((f) => f.status === "open").length;
  const resolvedCount = findings.filter((f) => f.status === "resolved").length;
  const total = findings.length;
  const resolutionRate = total > 0 ? Math.round((resolvedCount / total) * 100) : 0;

  return (
    <Row gutter={[12, 12]}>
      {(["high", "medium", "low"] as const).map((sev) => {
        const cfg = SEVERITY_CONFIG[sev];
        const count = sev === "high" ? highCount : sev === "medium" ? mediumCount : lowCount;
        const openBySev = findings.filter((f) => f.severity === sev && f.status === "open").length;
        return (
          <Col xs={12} sm={8} md={4} key={sev}>
            <Card
              size="small"
              styles={{
                body: {
                  background: cfg.bg,
                  border: `1px solid ${cfg.border}`,
                  borderRadius: 10,
                  padding: "12px 14px",
                },
              }}
              style={{ border: "none", boxShadow: "none" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <Text style={{ color: cfg.color, fontWeight: 600, fontSize: 13 }}>{cfg.label}</Text>
                <span style={{ color: cfg.color, fontSize: 16 }}>{cfg.icon}</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: cfg.color, lineHeight: 1 }}>{count}</div>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {openBySev > 0 ? `${openBySev} 待处理` : "全部已关闭"}
              </Text>
            </Card>
          </Col>
        );
      })}

      <Col xs={12} sm={8} md={4}>
        <Card
          size="small"
          styles={{
            body: {
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: 10,
              padding: "12px 14px",
            },
          }}
          style={{ border: "none", boxShadow: "none" }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <Text style={{ color: "#16a34a", fontWeight: 600, fontSize: 13 }}>已关闭</Text>
            <CheckCircleOutlined style={{ color: "#16a34a", fontSize: 16 }} />
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#16a34a", lineHeight: 1 }}>{resolvedCount}</div>
          <Text type="secondary" style={{ fontSize: 11 }}>{openCount > 0 ? `${openCount} 待处理` : "全部已关闭"}</Text>
        </Card>
      </Col>

      <Col xs={24} sm={24} md={8}>
        <Card
          size="small"
          styles={{
            body: {
              background: "rgba(20,40,60,0.03)",
              border: "1px solid rgba(20,40,60,0.1)",
              borderRadius: 10,
              padding: "12px 14px",
            },
          }}
          style={{ border: "none", boxShadow: "none" }}
        >
          <Statistic
            title={<Text style={{ fontSize: 12, color: "#64748b" }}>整体关闭率</Text>}
            value={resolutionRate}
            suffix="%"
            valueStyle={{
              fontSize: 28,
              fontWeight: 800,
              color: resolutionRate >= 80 ? "#16a34a" : resolutionRate >= 50 ? "#d97706" : "#dc2626",
            }}
          />
          <Text type="secondary" style={{ fontSize: 11 }}>
            共 {total} 条 · 已关 {resolvedCount} 条
          </Text>
        </Card>
      </Col>
    </Row>
  );
}
