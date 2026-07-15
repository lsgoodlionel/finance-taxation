/**
 * K1 老板工作台 · 纯呈现层（props 驱动，不发请求，便于独立渲染与测试）。
 * 移动端单列堆叠；桌面 ≥lg 时待办占左 2/3、KPI 右 1/3，问 AI 通栏。
 */
import React from "react";
import { Col, Row } from "antd";
import type { CashForecast, DashboardData } from "../../lib/api";
import { PageHeader } from "../../components/ui/PageHeader";
import type { PendingCardModel } from "./home-helpers";
import { HomePendingSection, type PendingActing } from "./HomePendingSection";
import { HomeKpiSection } from "./HomeKpiSection";
import { HomeAskSection } from "./HomeAskSection";

export interface HomePageViewProps {
  loading: boolean;
  error: string | null;
  pendingCards: readonly PendingCardModel[];
  pendingRemaining: number;
  acting: PendingActing;
  dashboard: DashboardData | null;
  forecast: CashForecast | null;
  onApprove: (draftId: string) => void;
  onReject: (draftId: string) => void;
  onRetry: () => void;
  /** 新手清单等由容器注入的插槽（保持本组件不依赖 lib/api，可独立渲染测试）。 */
  quickStartSlot?: React.ReactNode;
}

export function HomePageView({
  loading,
  error,
  pendingCards,
  pendingRemaining,
  acting,
  dashboard,
  forecast,
  onApprove,
  onReject,
  onRetry,
  quickStartSlot
}: HomePageViewProps) {
  return (
    <div style={{ display: "grid", gap: "var(--v7-guided-space, 20px)" }}>
      <section className="v3-hero-shell">
        <PageHeader
          title="今天"
          subtitle="需要您处理的事、公司现状、想问就问——都在这一屏。"
        />
      </section>

      {quickStartSlot}

      {error ? (
        <section className="v3-section-shell">
          <div style={{ display: "grid", gap: 8, justifyItems: "start" }}>
            <span style={{ color: "#dc2626", fontSize: 14 }}>{error}</span>
            <button className="btn btn-outline" style={{ minHeight: 44 }} onClick={onRetry}>
              重新加载
            </button>
          </div>
        </section>
      ) : (
        <Row gutter={[20, 20]}>
          <Col xs={24} lg={16}>
            <HomePendingSection
              loading={loading}
              cards={pendingCards}
              remaining={pendingRemaining}
              acting={acting}
              onApprove={onApprove}
              onReject={onReject}
            />
          </Col>
          <Col xs={24} lg={8}>
            <HomeKpiSection loading={loading} dashboard={dashboard} forecast={forecast} />
          </Col>
          <Col span={24}>
            <HomeAskSection />
          </Col>
        </Row>
      )}
    </div>
  );
}
