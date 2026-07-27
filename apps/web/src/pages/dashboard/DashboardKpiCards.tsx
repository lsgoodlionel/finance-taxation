import { Row, Col, Card, Statistic, Tag, Typography } from "antd";
import {
  RiseOutlined, FallOutlined, BankOutlined, SafetyOutlined,
} from "@ant-design/icons";
import type { DashboardData } from "../../lib/api";
import { hasTrendComparison } from "./kpi-trend";

const { Text } = Typography;

interface DashboardKpiCardsProps {
  data: DashboardData;
}

function TrendTag({ trend }: { trend: string }) {
  if (trend.startsWith("+")) {
    return <Tag color="success" icon={<RiseOutlined />}>{trend}</Tag>;
  }
  if (trend.startsWith("-")) {
    return <Tag color="error" icon={<FallOutlined />}>{trend}</Tag>;
  }
  return <Tag color="default">{trend}</Tag>;
}

const KPI_ICONS = [
  <RiseOutlined style={{ color: "#2563eb" }} />,
  <FallOutlined style={{ color: "#dc2626" }} />,
  <BankOutlined style={{ color: "#16a34a" }} />,
  <SafetyOutlined style={{ color: "#7c3aed" }} />,
];

export function DashboardKpiCards({ data }: DashboardKpiCardsProps) {
  return (
    <Row gutter={[16, 16]}>
      {data.cards.map((card, idx) => (
        <Col key={card.key} xs={24} sm={12} lg={6}>
          <Card
            style={{ borderRadius: 12, border: "1px solid #e2e8f0" }}
            styles={{ body: { padding: "20px 24px" } }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>{card.label}</Text>
                <Statistic
                  value={card.key !== "risk" ? card.value : undefined}
                  formatter={card.key !== "risk" ? undefined : () => card.value}
                  prefix={card.key !== "risk" ? "¥" : undefined}
                  valueStyle={{ fontSize: 24, fontWeight: 700, color: "#0f172a" }}
                  style={{ marginTop: 4 }}
                />
                <div style={{ marginTop: 6 }}>
                  <TrendTag trend={card.trend} />
                  {/* 风险卡没有历史快照、无法还原上期未关闭数，后端返回「—」；
                      此时不能挂「环比上月」，否则又是一句系统给不出的承诺。 */}
                  {hasTrendComparison(card.trend) ? (
                    <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>环比上月</Text>
                  ) : null}
                </div>
              </div>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: "#f1f5f9",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18,
              }}>
                {KPI_ICONS[idx % KPI_ICONS.length]}
              </div>
            </div>
          </Card>
        </Col>
      ))}
    </Row>
  );
}
