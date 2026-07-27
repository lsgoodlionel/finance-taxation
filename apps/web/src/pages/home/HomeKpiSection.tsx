/**
 * K1 第二段「公司现在怎么样」：4 个白话 KPI 大数字卡 + 红绿灯，点击可下钻。
 *
 * 呈现诚实：某一路数据源接口失败时，对应卡片显示「读取失败」而不是空态文案
 * ——「等财务录入本月账目后就能看到」会把接口故障/无权限归咎于用户没记账。
 */
import React from "react";
import { Button, Skeleton, Typography } from "antd";
import { Link } from "react-router-dom";
import type { CashForecast, DashboardData } from "../../lib/api";
import { Term } from "../../components/ui/Term";
import {
  describeRunway,
  estimateCashRunway,
  formatMoneyCny,
  profitTone,
  riskTone,
  runwayTone,
  TONE_COLORS,
  type TrafficTone
} from "./home-helpers";

const { Title, Text } = Typography;

interface HomeKpiSectionProps {
  loading: boolean;
  dashboard: DashboardData | null;
  forecast: CashForecast | null;
  /** 驾驶舱接口失败（含 403 无权限）：利润 / 税 / 风险三张卡改显示「读取失败」。 */
  dashboardFailed?: boolean;
  /** 现金流预测接口失败：现金卡改显示「读取失败」。 */
  forecastFailed?: boolean;
  onRetry?: () => void;
}

interface KpiCardModel {
  key: string;
  label: string;
  value: string;
  note: React.ReactNode;
  tone: TrafficTone;
  drillPath: string;
}

const FAILED_VALUE = "读取失败";
const FAILED_NOTE = "这项数据暂时读取不到（可能是网络或权限问题），不代表没有数据";

function findCardValue(dashboard: DashboardData | null, key: string): string | null {
  const card = dashboard?.cards.find((item) => item.key === key);
  return card && card.value !== "—" ? card.value : null;
}

function buildKpiCards(
  dashboard: DashboardData | null,
  forecast: CashForecast | null,
  dashboardFailed: boolean,
  forecastFailed: boolean
): KpiCardModel[] {
  const runway = estimateCashRunway(forecast);
  const runwayText = describeRunway(runway);
  const netProfit = dashboard?.profitOverview.netProfit ?? null;
  const netProfitText = formatMoneyCny(netProfit);
  const taxText = formatMoneyCny(findCardValue(dashboard, "tax"));
  const riskCount = dashboard?.riskCount ?? null;

  return [
    {
      key: "runway",
      label: "现金还能撑多久",
      value: forecastFailed ? FAILED_VALUE : runwayText.value,
      note: forecastFailed ? FAILED_NOTE : runwayText.note,
      tone: forecastFailed ? "neutral" : runwayTone(runway),
      drillPath: "/dashboard/chairman"
    },
    {
      key: "profit",
      label: "本月赚了多少",
      value: dashboardFailed ? FAILED_VALUE : netProfitText ?? "暂无数据",
      note: dashboardFailed
        ? FAILED_NOTE
        : netProfitText !== null
          ? "收入减去所有成本费用后，真正剩下的钱"
          : "等财务录入本月账目后就能看到",
      tone: !dashboardFailed && netProfit !== null
        ? profitTone(netProfit, dashboard?.profitOverview.netMargin ?? "")
        : "neutral",
      drillPath: "/reports"
    },
    {
      key: "tax",
      label: "本月要交多少税",
      value: dashboardFailed ? FAILED_VALUE : taxText ?? "暂无数据",
      note: dashboardFailed
        ? FAILED_NOTE
        : taxText !== null
          ? "按目前账面估算，实际以申报为准"
          : "等财务录入本月账目后就能看到",
      // 税额本身没有「好/坏」的红绿灯语义（金额大不等于有问题），保持中性不误导。
      tone: "neutral",
      drillPath: "/tax"
    },
    {
      key: "risk",
      label: "有没有风险",
      value: dashboardFailed
        ? FAILED_VALUE
        : riskCount === null ? "暂无数据" : riskCount === 0 ? "一切正常" : `${riskCount} 个风险`,
      note: dashboardFailed
        ? FAILED_NOTE
        : riskCount === null
          ? "风险数据暂时取不到"
          : (
            <>
              来自系统自动<Term k="reconciliation">勾稽</Term>与风险扫描
            </>
          ),
      tone: dashboardFailed || riskCount === null ? "neutral" : riskTone(riskCount),
      drillPath: "/risk"
    }
  ];
}

function KpiCard({ card }: { card: KpiCardModel }) {
  const color = TONE_COLORS[card.tone];
  return (
    <Link
      to={card.drillPath}
      style={{
        display: "grid",
        gap: 6,
        padding: "16px 18px",
        borderRadius: 14,
        border: "1px solid rgba(20,40,60,0.08)",
        borderTop: `3px solid ${color}`,
        background: "rgba(255,255,255,0.92)",
        color: "inherit",
        minHeight: 44
      }}
    >
      <Text type="secondary" style={{ fontSize: 13 }}>{card.label}</Text>
      <span style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1.3 }}>{card.value}</span>
      <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.6 }}>{card.note}</Text>
    </Link>
  );
}

export function HomeKpiSection({
  loading,
  dashboard,
  forecast,
  dashboardFailed = false,
  forecastFailed = false,
  onRetry
}: HomeKpiSectionProps) {
  const allFailed = dashboardFailed && forecastFailed;

  function renderBody() {
    if (loading) {
      return <Skeleton active paragraph={{ rows: 4 }} />;
    }
    if (allFailed) {
      return (
        <div style={{ display: "grid", gap: 8, justifyItems: "start" }}>
          <Text type="secondary">经营数据暂时读取不到（可能是网络或权限问题），稍后再试或直接问 AI。</Text>
          {onRetry ? (
            <Button size="small" style={{ minHeight: 44 }} onClick={onRetry}>重新读取</Button>
          ) : null}
        </div>
      );
    }
    if (!dashboard && !forecast && !dashboardFailed && !forecastFailed) {
      return <Text type="secondary">经营数据暂时取不到，点击任意卡片位置稍后再试，或直接问 AI。</Text>;
    }
    return (
      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))"
        }}
      >
        {buildKpiCards(dashboard, forecast, dashboardFailed, forecastFailed).map((card) => (
          <KpiCard key={card.key} card={card} />
        ))}
      </div>
    );
  }

  return (
    <section className="v3-section-shell" aria-label="公司现在怎么样">
      <Title level={4} style={{ marginTop: 0, marginBottom: 12 }}>公司现在怎么样</Title>
      {renderBody()}
    </section>
  );
}
