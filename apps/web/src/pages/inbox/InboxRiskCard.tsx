/**
 * 收件箱 · 风险预警卡片
 * 展示未关闭的高危/致命风险发现，点击直达 /risk。
 */
import { Button, Empty, Space, Spin, Tag, Typography } from "antd";
import { RightOutlined, SafetyCertificateOutlined, WarningOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import type { RiskFinding } from "@finance-taxation/domain-model";
import { useI18n, RISK_SEVERITY_LABELS } from "../../lib/i18n";
import { rankRiskSeverity } from "./inbox-helpers";

const { Text } = Typography;

const MAX_VISIBLE = 6;
const SEVERITY_COLOR: Record<string, string> = {
  critical: "#dc2626", high: "#d97706", medium: "#2563eb", low: "#6c7a89",
};

interface InboxRiskCardProps {
  findings: RiskFinding[];
  loading: boolean;
}

export function InboxRiskCard({ findings, loading }: InboxRiskCardProps) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const open = findings
    .filter((f) => f.status === "open")
    .slice()
    .sort((a, b) => rankRiskSeverity(a.severity) - rankRiskSeverity(b.severity));
  const highCount = open.filter((f) => f.severity === "high").length;

  return (
    <section className="v3-section-shell" data-testid="inbox-risk-card">
      <Space style={{ justifyContent: "space-between", width: "100%" }}>
        <Space size={8}>
          <Text strong>⚠️ 风险预警</Text>
          {highCount > 0 && <Tag color="error">{highCount} 项高危</Tag>}
          {open.length > 0 && <Tag>{open.length} 项待关闭</Tag>}
        </Space>
        <Button type="link" size="small" onClick={() => navigate("/risk")}>
          前往风险中心 <RightOutlined />
        </Button>
      </Space>

      {loading ? (
        <div style={{ padding: "24px 0", textAlign: "center" }}><Spin /></div>
      ) : open.length === 0 ? (
        <Empty
          style={{ margin: "16px 0" }}
          image={<SafetyCertificateOutlined style={{ fontSize: 32, color: "#16a34a" }} />}
          description={
            <Space direction="vertical" size={2}>
              <Text>暂无未关闭的风险预警</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                下一步建议：定期在风险勾稽中心运行风险检查，尽早发现口径不一致或申报不完整问题。
              </Text>
            </Space>
          }
        />
      ) : (
        <Space direction="vertical" size={8} style={{ width: "100%", marginTop: 10 }}>
          {open.slice(0, MAX_VISIBLE).map((finding) => (
            <div
              key={finding.id}
              onClick={() => navigate("/risk")}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                borderRadius: 8, border: "1px solid rgba(20,40,60,0.08)",
                borderLeft: `3px solid ${SEVERITY_COLOR[finding.severity] ?? "#6c7a89"}`,
                cursor: "pointer",
              }}
            >
              <WarningOutlined style={{ color: SEVERITY_COLOR[finding.severity] ?? "#6c7a89" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text strong style={{ fontSize: 13 }}>{finding.title}</Text>
                <div style={{ fontSize: 11, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {finding.detail}
                </div>
              </div>
              <Tag color={finding.severity === "high" ? "error" : finding.severity === "medium" ? "blue" : "default"}>
                {t(RISK_SEVERITY_LABELS, finding.severity)}
              </Tag>
              <RightOutlined style={{ color: "#94a3b8", fontSize: 11 }} />
            </div>
          ))}
          {open.length > MAX_VISIBLE && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              还有 {open.length - MAX_VISIBLE} 项，前往风险中心查看全部。
            </Text>
          )}
        </Space>
      )}
    </section>
  );
}
