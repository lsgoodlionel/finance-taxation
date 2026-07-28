/**
 * 历史收支趋势图 —— 每个点都来自 `/api/dashboard/chairman/trend`。
 *
 * 这张图曾经被整个删掉：上一版只有本月是真数，另外 5 个点由一组写死系数
 * `[0.72, 0.81, 0.88, 0.94, 0.97, 1.0]` 乘本月收入得到，于是无论公司实际增长还是
 * 下滑，图上永远是一条单调上升的曲线，而标题写着「近 6 月收支趋势」。删除的理由是
 * 后端当时给不出按期间的历史损益。现在接口有了，这一版画的是总账里真实的按期聚合。
 *
 * 本组件不做任何计算：金额解析与缺口处理全在 trend-series.ts 的纯函数里，
 * 「每个点都来自接口返回」由 trend-series.test.ts 逐点钉住。
 *
 * 缺口的画法：没有账的期间金额为 `null`，recharts 的 `connectNulls` 保持默认
 * false，于是断开而不是连一条直线过去。整段区间都没有账则整块留白，不画空图。
 */
import { useEffect, useState } from "react";
import { Card, Skeleton, Tag, Typography } from "antd";
import {
  Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { getDashboardChairmanTrend, type ChairmanTrendData } from "../../lib/api";
import { Term } from "../../components/ui/Term";
import {
  buildTrendSeries,
  describeTrendCoverage,
  hasAnyTrendData,
} from "./trend-series";

const { Text } = Typography;

/** 与后端 DEFAULT_TREND_MONTHS 一致；改这里也要改标题里的月数说法。 */
const TREND_MONTHS = 6;

const WAN = 10000;

function formatTick(value: number): string {
  return Math.abs(value) >= WAN ? `${(value / WAN).toFixed(0)}w` : String(value);
}

function TrendCard({ extra, children }: { extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card
      title={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Text strong>近 {TREND_MONTHS} 月收支趋势</Text>
          {extra}
        </div>
      }
      style={{ borderRadius: 12 }}
      styles={{ body: { paddingTop: 8 } }}
    >
      {children}
    </Card>
  );
}

export function DashboardTrendChart() {
  const [trend, setTrend] = useState<ChairmanTrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDashboardChairmanTrend(TREND_MONTHS)
      .then((data) => {
        if (!cancelled) setTrend(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "趋势数据加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <TrendCard>
        <div style={{ height: 220 }}>
          <Skeleton active title={false} paragraph={{ rows: 5 }} />
        </div>
      </TrendCard>
    );
  }

  // 取数失败就说取数失败。画一张空图或退回估算值，都是把「不知道」说成「知道」。
  if (error || !trend) {
    return (
      <TrendCard>
        <div style={{ height: 220, display: "grid", placeItems: "center" }}>
          <Text type="secondary">{error ?? "趋势数据加载失败"}</Text>
        </div>
      </TrendCard>
    );
  }

  if (!hasAnyTrendData(trend)) {
    return (
      <TrendCard extra={<Tag>暂无数据</Tag>}>
        <div style={{ height: 220, display: "grid", placeItems: "center", textAlign: "center" }}>
          <Text type="secondary">
            这 {trend.points.length} 个期间账上都还没有<Term k="journal-entry">分录</Term>，
            等有账之后这里会画出真实的收支曲线。
          </Text>
        </div>
      </TrendCard>
    );
  }

  const series = buildTrendSeries(trend);

  return (
    <TrendCard>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#2563eb" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="gradCost" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#dc2626" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#dc2626" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={formatTick} />
          <Tooltip
            formatter={(value) => [`¥${Number(value).toLocaleString("zh-CN")}`, ""]}
            labelFormatter={(_label, payload) => payload?.[0]?.payload?.period ?? _label}
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area name="收入" type="monotone" dataKey="revenue" stroke="#2563eb" fill="url(#gradRevenue)" strokeWidth={2} dot={false} />
          <Area name="成本" type="monotone" dataKey="cost" stroke="#dc2626" fill="url(#gradCost)" strokeWidth={2} dot={false} />
          <Area name="费用" type="monotone" dataKey="expense" stroke="#d97706" fill="none" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
      {/* 图注如实交代取数来源与缺口：缺的月份不是瑕疵，本身就是「那几个月没记账」。 */}
      <Text type="secondary" style={{ fontSize: 11 }}>
        {describeTrendCoverage(trend)}，取自<Term k="general-ledger">总账</Term>
        <Term k="journal-entry">分录</Term>
      </Text>
    </TrendCard>
  );
}
