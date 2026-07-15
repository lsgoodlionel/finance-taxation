import { useEffect, useState } from "react";
import { Typography, Row, Col, Card, Collapse, Statistic, Space, Tag, Skeleton } from "antd";
import {
  CheckCircleOutlined, ExclamationCircleOutlined,
} from "@ant-design/icons";
import { getDashboardChairman, type DashboardData } from "../lib/api";
import { CHAIRMAN_DASHBOARD_SUBTITLE } from "../lib/entry-guidance";
import { useWorkspaceMode } from "../lib/workspace-mode";
import { PageSkeleton } from "../components/ui/PageSkeleton";
import { PageHeader } from "../components/ui/PageHeader";
import { Term } from "../components/ui/Term";
import { DashboardKpiCards } from "./dashboard/DashboardKpiCards";
import { DashboardTrendChart } from "./dashboard/DashboardTrendChart";
import { DashboardPieChart } from "./dashboard/DashboardPieChart";
import { DashboardAlertCards } from "./dashboard/DashboardAlertCards";
import { CashForecastCard } from "./dashboard/CashForecastCard";

const { Text } = Typography;

function AiSummaryCard({ aiSummary }: { aiSummary: DashboardData["aiSummary"] }) {
  return (
    <Card
      title={
        <Space>
          <Text strong>AI 工作摘要</Text>
          <Tag color="blue">{aiSummary.date}</Tag>
        </Space>
      }
      style={{ borderRadius: 12, height: "100%" }}
    >
      <Row gutter={[0, 8]}>
        {[
          { key: "newEvents", label: "当天新建事项" as React.ReactNode, value: aiSummary.newEvents },
          {
            key: "postedVouchers",
            label: <>当天已<Term k="posting">过账</Term><Term k="voucher">凭证</Term></> as React.ReactNode,
            value: aiSummary.postedVouchers,
          },
          {
            key: "pendingTaxBatches",
            label: <>待提交<Term k="filing-batch">税务批次</Term></> as React.ReactNode,
            value: aiSummary.pendingTaxBatches,
          },
        ].map(({ key, label, value }) => (
          <Col key={key} span={24}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Text type="secondary" style={{ fontSize: 13 }}>{label}</Text>
              <Text strong style={{ fontSize: 15 }}>{value}</Text>
            </div>
          </Col>
        ))}
        <Col span={24} style={{ paddingTop: 8, borderTop: "1px solid #f0f0f0", marginTop: 4 }}>
          <Text type="secondary" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            工作亮点
          </Text>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.9, fontSize: 13 }}>
            {aiSummary.highlights.map(item => <li key={item}>{item}</li>)}
          </ul>
        </Col>
      </Row>
    </Card>
  );
}

function ProfitSummaryCard({ profitOverview }: { profitOverview: DashboardData["profitOverview"] }) {
  const grossMarginNum = parseFloat(profitOverview.grossMargin) || 0;
  const netMarginNum   = parseFloat(profitOverview.netMargin)   || 0;

  return (
    <Card title={<Text strong>利润与费用概览</Text>} style={{ borderRadius: 12 }}>
      <Row gutter={[16, 16]}>
        <Col span={12}>
          <Statistic
            title="主营收入"
            value={profitOverview.revenue}
            prefix="¥"
            valueStyle={{ fontSize: 16 }}
          />
        </Col>
        <Col span={12}>
          <Statistic
            title="主营成本"
            value={profitOverview.cost}
            prefix="¥"
            valueStyle={{ fontSize: 16 }}
          />
        </Col>
        <Col span={12}>
          <Statistic
            title="毛利润"
            value={profitOverview.grossProfit}
            prefix="¥"
            valueStyle={{ fontSize: 16, color: grossMarginNum >= 30 ? "#16a34a" : "#d97706" }}
          />
        </Col>
        <Col span={12}>
          <Statistic
            title="净利润"
            value={profitOverview.netProfit}
            prefix="¥"
            valueStyle={{ fontSize: 16, color: netMarginNum >= 10 ? "#16a34a" : "#d97706" }}
          />
        </Col>
        <Col span={12}>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>毛利率</Text>
            <div>
              <Tag color={grossMarginNum >= 30 ? "success" : "warning"} style={{ marginTop: 4 }}>
                {profitOverview.grossMargin}
              </Tag>
            </div>
          </div>
        </Col>
        <Col span={12}>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>净利率</Text>
            <div>
              <Tag color={netMarginNum >= 10 ? "success" : "warning"} style={{ marginTop: 4 }}>
                {profitOverview.netMargin}
              </Tag>
            </div>
          </div>
        </Col>
      </Row>
    </Card>
  );
}

export function ChairmanDashboardPage() {
  const { mode } = useWorkspaceMode();
  const isGuided = mode === "guided";
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDashboardChairman()
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageSkeleton variant="dashboard" />;

  if (error || !data) {
    return (
      <Card style={{ borderRadius: 12, textAlign: "center", padding: "40px 0" }}>
        <ExclamationCircleOutlined style={{ fontSize: 32, color: "#dc2626" }} />
        <div style={{ marginTop: 12, color: "#dc2626" }}>{error || "数据加载失败"}</div>
      </Card>
    );
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {/* Hero header：guided 用白话「经营报告」口径，pro 保留专业驾驶舱 */}
      <section className="v3-hero-shell">
        <PageHeader
          title={isGuided ? "经营报告" : "董事长驾驶舱"}
          subtitle={isGuided ? "公司赚不赚钱、钱够不够用、有没有风险，这一页讲清楚。" : CHAIRMAN_DASHBOARD_SUBTITLE}
          actions={(
            <Space>
              <Tag icon={<CheckCircleOutlined />} color="success">系统正常</Tag>
              <Tag color="blue">{data.aiSummary.date}</Tag>
            </Space>
          )}
        />
      </section>

      {/* KPI 概览（summary-first）*/}
      <section className="v3-section-shell" data-tone="accent">
        <DashboardKpiCards data={data} />
      </section>

      {/* Charts */}
      <section className="v3-section-shell">
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={14}><DashboardTrendChart data={data} /></Col>
          <Col xs={24} lg={10}><DashboardPieChart data={data} /></Col>
        </Row>
      </section>

      {/* Cash forecast */}
      <section className="v3-section-shell">
        <CashForecastCard />
      </section>

      {/* Profit + AI summary：guided 把凭证/批次等黑话统计折叠进「财务细节」 */}
      <section className="v3-section-shell" data-tone="muted">
        {isGuided ? (
          <Row gutter={[16, 16]}>
            <Col span={24}><ProfitSummaryCard profitOverview={data.profitOverview} /></Col>
            <Col span={24}>
              <Collapse
                ghost
                items={[{
                  key: "finance-detail",
                  label: "财务细节（凭证、申报等专业统计，想看再展开）",
                  children: <AiSummaryCard aiSummary={data.aiSummary} />
                }]}
              />
            </Col>
          </Row>
        ) : (
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}><ProfitSummaryCard profitOverview={data.profitOverview} /></Col>
            <Col xs={24} lg={12}><AiSummaryCard aiSummary={data.aiSummary} /></Col>
          </Row>
        )}
      </section>

      {/* Alerts */}
      <section className="v3-section-shell">
        <DashboardAlertCards riskBoard={data.riskBoard} queues={data.queues} />
      </section>
    </div>
  );
}
