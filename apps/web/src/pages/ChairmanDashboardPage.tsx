import { useEffect, useState } from "react";
import { getDashboardChairman, type DashboardData } from "../lib/api";
import { Link } from "react-router-dom";

function cardStyle() {
  return {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)",
    boxShadow: "0 18px 60px rgba(20,40,60,0.08)"
  } as const;
}

function trendColor(trend: string): string {
  if (trend.startsWith("+") || trend === "0") return "#22c55e";
  if (trend.startsWith("-")) return "#ef4444";
  return "#6c7a89";
}

function queueAccent(severity: "high" | "medium" | "low") {
  if (severity === "high") return "#ef4444";
  if (severity === "medium") return "#f59e0b";
  return "#64748b";
}

export function ChairmanDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDashboardChairman()
      .then(setData)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section style={{ padding: "40px", textAlign: "center", color: "#6c7a89" }}>
        加载中…
      </section>
    );
  }

  if (error || !data) {
    return (
      <section style={{ padding: "40px", textAlign: "center", color: "#ef4444" }}>
        {error || "数据加载失败"}
      </section>
    );
  }

  const { cards, queues, profitOverview, riskBoard, aiSummary } = data;

  return (
    <section style={{ display: "grid", gap: "20px" }}>
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px"
        }}
      >
        {cards.map((card) => (
          <article key={card.key} style={{ ...cardStyle(), padding: "18px" }}>
            <div style={{ color: "#6c7a89", fontSize: "14px" }}>{card.label}</div>
            <div style={{ fontSize: "30px", margin: "10px 0 6px", fontWeight: 700 }}>
              {card.key !== "risk" ? `¥${card.value}` : card.value}
            </div>
            <div style={{ color: trendColor(card.trend), fontSize: "13px", fontWeight: 600 }}>
              {card.trend}
            </div>
          </article>
        ))}
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
        <article style={{ ...cardStyle(), padding: "24px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", fontWeight: 700, color: "#f59e0b" }}>
            {queues.approvals}
          </div>
          <div style={{ color: "#6c7a89", marginTop: "8px" }}>待审批凭证</div>
        </article>
        <article style={{ ...cardStyle(), padding: "24px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", fontWeight: 700, color: "#ef4444" }}>
            {queues.blockedTasks}
          </div>
          <div style={{ color: "#6c7a89", marginTop: "8px" }}>阻塞任务</div>
        </article>
        <article style={{ ...cardStyle(), padding: "24px", textAlign: "center" }}>
          <div style={{ fontSize: "40px", fontWeight: 700, color: "#8b5cf6" }}>
            {queues.overdueTasks}
          </div>
          <div style={{ color: "#6c7a89", marginTop: "8px" }}>逾期任务</div>
        </article>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: "16px" }}>
        <article style={{ ...cardStyle(), padding: "20px" }}>
          <h3 style={{ marginTop: 0 }}>利润与费用概览</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
            <tbody>
              <tr><td style={{ padding: "8px 0", color: "#6c7a89" }}>主营收入</td><td style={{ textAlign: "right" }}>¥{profitOverview.revenue}</td></tr>
              <tr><td style={{ padding: "8px 0", color: "#6c7a89" }}>主营成本</td><td style={{ textAlign: "right" }}>¥{profitOverview.cost}</td></tr>
              <tr><td style={{ padding: "8px 0", color: "#6c7a89" }}>期间费用</td><td style={{ textAlign: "right" }}>¥{profitOverview.expense}</td></tr>
              <tr><td style={{ padding: "8px 0", fontWeight: 700 }}>毛利润</td><td style={{ textAlign: "right", fontWeight: 700 }}>¥{profitOverview.grossProfit}</td></tr>
              <tr><td style={{ padding: "8px 0", fontWeight: 700 }}>净利润</td><td style={{ textAlign: "right", fontWeight: 700 }}>¥{profitOverview.netProfit}</td></tr>
              <tr><td style={{ padding: "8px 0", color: "#6c7a89" }}>毛利率</td><td style={{ textAlign: "right" }}>{profitOverview.grossMargin}</td></tr>
              <tr><td style={{ padding: "8px 0", color: "#6c7a89" }}>净利率</td><td style={{ textAlign: "right" }}>{profitOverview.netMargin}</td></tr>
            </tbody>
          </table>
        </article>

        <article style={{ ...cardStyle(), padding: "20px" }}>
          <h3 style={{ marginTop: 0 }}>AI 工作摘要</h3>
          <div style={{ display: "grid", gap: "10px", fontSize: "14px" }}>
            <div>日期：{aiSummary.date}</div>
            <div>当天新建事项：{aiSummary.newEvents}</div>
            <div>当天已过账凭证：{aiSummary.postedVouchers}</div>
            <div>待提交税务批次：{aiSummary.pendingTaxBatches}</div>
            <ul style={{ margin: "6px 0 0", paddingLeft: "20px", lineHeight: 1.8 }}>
              {aiSummary.highlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </article>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <article style={{ ...cardStyle(), padding: "20px" }}>
          <h3 style={{ marginTop: 0 }}>风险与待办</h3>
          <div style={{ display: "grid", gap: "16px" }}>
            {[
              { label: "待审批凭证", items: riskBoard.approvals },
              { label: "阻塞任务", items: riskBoard.blockedTasks },
              { label: "逾期任务", items: riskBoard.overdueTasks },
              { label: "风险事项", items: riskBoard.riskEvents }
            ].map(({ label, items }) => (
              <div key={label}>
                <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "8px" }}>{label}</div>
                {items.length ? (
                  <ul style={{ margin: 0, paddingLeft: "20px", lineHeight: 1.8 }}>
                    {items.map((item) => (
                      <li key={item.id}>
                        <Link to={item.route} style={{ color: queueAccent(item.severity) }}>
                          {item.title}
                        </Link>
                        {" | "}
                        {item.status}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div style={{ color: "#6c7a89", fontSize: "13px" }}>当前无待处理项</div>
                )}
              </div>
            ))}
          </div>
        </article>

        <article style={{ ...cardStyle(), padding: "20px" }}>
          <h3 style={{ marginTop: 0 }}>执行建议</h3>
          <ul style={{ paddingLeft: "20px", lineHeight: 1.9, margin: 0 }}>
            <li>优先处理待审批凭证，避免已识别事项长期停留在未过账状态。</li>
            <li>优先清理阻塞和逾期任务，避免影响税务申报与资料归档时效。</li>
            <li>关注主营收入、主营成本和期间费用的变动，及时复核毛利率与净利率。</li>
            <li>对待提交税务批次逐个核对状态，避免跨期积压。</li>
          </ul>
        </article>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
        {[
          {
            title: "财务报表中心",
            route: "/reports",
            summary: "查看资产负债表、利润表、现金流量表，并按月/季/年切换。"
          },
          {
            title: "研发辅助账",
            route: "/rnd",
            summary: "维护研发项目，查看费用化、资本化、工时与加计扣除基数。"
          },
          {
            title: "风险勾稽中心",
            route: "/risk",
            summary: `查看风险发现 ${data.riskCount} 条，并对经营事项触发规则检查。`
          }
        ].map((item) => (
          <article key={item.route} style={{ ...cardStyle(), padding: "20px" }}>
            <h3 style={{ marginTop: 0 }}>{item.title}</h3>
            <p style={{ color: "#4d5d6c", lineHeight: 1.8, minHeight: "70px" }}>{item.summary}</p>
            <Link to={item.route} style={{ color: "#1e2a37", fontWeight: 700 }}>
              进入模块
            </Link>
          </article>
        ))}
      </section>
    </section>
  );
}
