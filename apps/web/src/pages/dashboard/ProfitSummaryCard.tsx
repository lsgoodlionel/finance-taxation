/**
 * 利润与费用概览。从 ChairmanDashboardPage 里搬出来，页面只留装配。
 */
import React from "react";
import { Card, Col, Row, Statistic, Tag, Typography } from "antd";
import type { DashboardData } from "../../lib/api";

const { Text } = Typography;

/** 毛利率 / 净利率的「健康」门槛，用于标签配色。 */
const HEALTHY_GROSS_MARGIN_PERCENT = 30;
const HEALTHY_NET_MARGIN_PERCENT = 10;

interface ProfitSummaryCardProps {
  profitOverview: DashboardData["profitOverview"];
}

export function ProfitSummaryCard({ profitOverview }: ProfitSummaryCardProps) {
  const grossMargin = Number.parseFloat(profitOverview.grossMargin) || 0;
  const netMargin = Number.parseFloat(profitOverview.netMargin) || 0;

  return (
    <Card title={<Text strong>利润与费用概览</Text>} style={{ borderRadius: 12, height: "100%" }}>
      <Row gutter={[16, 16]}>
        <Col span={12}>
          <Statistic title="主营收入" value={profitOverview.revenue} prefix="¥" valueStyle={{ fontSize: 16 }} />
        </Col>
        <Col span={12}>
          <Statistic title="主营成本" value={profitOverview.cost} prefix="¥" valueStyle={{ fontSize: 16 }} />
        </Col>
        <Col span={12}>
          <Statistic
            title="毛利润"
            value={profitOverview.grossProfit}
            prefix="¥"
            valueStyle={{ fontSize: 16, color: grossMargin >= HEALTHY_GROSS_MARGIN_PERCENT ? "#16a34a" : "#d97706" }}
          />
        </Col>
        <Col span={12}>
          <Statistic
            title="净利润"
            value={profitOverview.netProfit}
            prefix="¥"
            valueStyle={{ fontSize: 16, color: netMargin >= HEALTHY_NET_MARGIN_PERCENT ? "#16a34a" : "#d97706" }}
          />
        </Col>
        <Col span={12}>
          <Text type="secondary" style={{ fontSize: 12 }}>毛利率</Text>
          <div>
            <Tag color={grossMargin >= HEALTHY_GROSS_MARGIN_PERCENT ? "success" : "warning"} style={{ marginTop: 4 }}>
              {profitOverview.grossMargin}
            </Tag>
          </div>
        </Col>
        <Col span={12}>
          <Text type="secondary" style={{ fontSize: 12 }}>净利率</Text>
          <div>
            <Tag color={netMargin >= HEALTHY_NET_MARGIN_PERCENT ? "success" : "warning"} style={{ marginTop: 4 }}>
              {profitOverview.netMargin}
            </Tag>
          </div>
        </Col>
      </Row>
    </Card>
  );
}
