import { Row, Col, Card, Statistic, Tag, Typography } from "antd";
import { ExperimentOutlined, CalculatorOutlined } from "@ant-design/icons";
import type { RndProject, RndProjectSummary } from "@finance-taxation/domain-model";

const { Text } = Typography;

interface RndKpiCardsProps {
  projects: Array<RndProject & { summary: RndProjectSummary }>;
}

export function RndKpiCards({ projects }: RndKpiCardsProps) {
  const activeProjects  = projects.filter(p => p.status === "active" || p.status === "planning").length;
  const totalInvestment = projects.reduce((sum, p) => {
    return sum + parseFloat(p.summary.expenseAmount || "0") + parseFloat(p.summary.capitalizedAmount || "0");
  }, 0);
  const eligibleBase = projects.reduce((sum, p) => {
    return sum + parseFloat(p.summary.superDeductionEligibleBase || "0");
  }, 0);
  const estimatedDeduction = eligibleBase * 0.75; // 75% super-deduction rate

  const items = [
    {
      key: "projects",
      label: "进行中研发项目",
      value: activeProjects,
      suffix: "项",
      icon: <ExperimentOutlined style={{ color: "#2563eb" }} />,
      bg: "#eff6ff",
    },
    {
      key: "investment",
      label: "本年累计研发投入",
      value: totalInvestment.toFixed(0),
      prefix: "¥",
      icon: <ExperimentOutlined style={{ color: "#16a34a" }} />,
      bg: "#f0fdf4",
    },
    {
      key: "eligible",
      label: "可加计扣除基数",
      value: eligibleBase.toFixed(0),
      prefix: "¥",
      icon: <CalculatorOutlined style={{ color: "#d97706" }} />,
      bg: "#fffbeb",
    },
    {
      key: "deduction",
      label: "预计加计扣除额（75%）",
      value: estimatedDeduction.toFixed(0),
      prefix: "¥",
      icon: <CalculatorOutlined style={{ color: "#7c3aed" }} />,
      bg: "#f5f3ff",
    },
  ];

  return (
    <Row gutter={[16, 16]}>
      {items.map(item => (
        <Col key={item.key} xs={24} sm={12} lg={6}>
          <Card
            style={{ borderRadius: 12, background: item.bg, border: "1px solid #e2e8f0" }}
            styles={{ body: { padding: "18px 20px" } }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>{item.label}</Text>
                <Statistic
                  value={item.value}
                  prefix={item.prefix}
                  suffix={item.suffix}
                  valueStyle={{ fontSize: 22, fontWeight: 700 }}
                  style={{ marginTop: 4 }}
                />
              </div>
              <div style={{
                width: 36, height: 36, borderRadius: 9,
                background: "rgba(255,255,255,0.7)",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
              }}>
                {item.icon}
              </div>
            </div>
          </Card>
        </Col>
      ))}
    </Row>
  );
}
