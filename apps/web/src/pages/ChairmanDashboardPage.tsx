import { useEffect, useState } from "react";
import { getDashboardChairman, type DashboardData } from "../lib/api";

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

  const { cards, queues } = data;

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
    </section>
  );
}
