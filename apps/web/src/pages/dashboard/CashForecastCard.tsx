/**
 * 资金前瞻卡（P7-B1）：当前资金 + 预计流入/流出 + 能否发工资判断。
 */
import { useEffect, useState } from "react";
import { Card, Statistic, Row, Col, Alert, Tag, Spin, Typography } from "antd";
import { FundOutlined } from "@ant-design/icons";
import { getCashForecast, type CashForecast } from "../../lib/api";
import { usePeriod } from "../../lib/period-context";

const { Text } = Typography;

export function CashForecastCard() {
  const { period } = usePeriod();
  const [fc, setFc] = useState<CashForecast | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getCashForecast(period)
      .then((d) => setFc(d.forecast))
      .catch(() => setFc(null))
      .finally(() => setLoading(false));
  }, [period]);

  return (
    <Card title={<span><FundOutlined style={{ color: "#2563eb", marginRight: 8 }} />资金前瞻（{period}）</span>}
      style={{ borderRadius: 12, height: "100%" }}>
      {loading ? (
        <div style={{ textAlign: "center", padding: 20 }}><Spin /></div>
      ) : !fc ? (
        <Text type="secondary">暂无资金数据</Text>
      ) : (
        <>
          <Row gutter={[12, 8]}>
            <Col span={12}><Statistic title="可动用资金" value={fc.cashBalance} precision={2} prefix="¥" valueStyle={{ fontSize: 18 }} /></Col>
            <Col span={12}><Statistic title="结清后预计余额" value={fc.projectedBalance} precision={2} prefix="¥"
              valueStyle={{ fontSize: 18, color: fc.projectedBalance < 0 ? "#dc2626" : "#16a34a" }} /></Col>
            <Col span={12}><Statistic title="预计流入(应收)" value={fc.expectedInflow} precision={2} prefix="¥" valueStyle={{ fontSize: 14, color: "#16a34a" }} /></Col>
            <Col span={12}><Statistic title="预计流出(应付/税/薪)" value={fc.expectedOutflow} precision={2} prefix="¥" valueStyle={{ fontSize: 14, color: "#d97706" }} /></Col>
          </Row>
          <div style={{ marginTop: 12 }}>
            <Tag color={fc.canPaySalary ? "success" : "error"}>
              {fc.canPaySalary ? "本期工资社保可发" : "工资社保资金不足"}
            </Tag>
            {fc.gap > 0 && <Tag color="warning">缺口 ¥{fc.gap.toFixed(2)}</Tag>}
          </div>
          <Alert style={{ marginTop: 10 }} type={fc.canPaySalary && fc.gap === 0 ? "success" : "warning"}
            message={<span style={{ fontSize: 12 }}>{fc.verdict}</span>} />
        </>
      )}
    </Card>
  );
}
