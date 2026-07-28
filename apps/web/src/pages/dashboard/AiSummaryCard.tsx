/**
 * 「财务今天做了什么」的专业统计（当天新建事项 / 已过账凭证 / 待提交税务批次）。
 *
 * 两种模式下都默认收起（改造前只有 guided 收起、pro 与利润卡并排）：
 * 这些是财务自己的过程指标，对着驾驶舱的三问一个都答不上；pro 用户真要看凭证和
 * 申报的进度，/vouchers 和 /tax 上是可操作的完整列表，这里的三个数字只是摘要。
 */
import React from "react";
import { Card, Col, Row, Space, Tag, Typography } from "antd";
import type { DashboardData } from "../../lib/api";
import { Term } from "../../components/ui/Term";

const { Text } = Typography;

interface AiSummaryCardProps {
  aiSummary: DashboardData["aiSummary"];
}

export function AiSummaryCard({ aiSummary }: AiSummaryCardProps) {
  const rows: { key: string; label: React.ReactNode; value: number }[] = [
    { key: "newEvents", label: "当天新建事项", value: aiSummary.newEvents },
    {
      key: "postedVouchers",
      label: <>当天已<Term k="posting">过账</Term><Term k="voucher">凭证</Term></>,
      value: aiSummary.postedVouchers
    },
    {
      key: "pendingTaxBatches",
      label: <>待提交<Term k="filing-batch">税务批次</Term></>,
      value: aiSummary.pendingTaxBatches
    }
  ];

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
        {rows.map(({ key, label, value }) => (
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
            {aiSummary.highlights.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </Col>
      </Row>
    </Card>
  );
}
