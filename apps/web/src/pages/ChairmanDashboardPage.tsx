import { useEffect, useState } from "react";
import { getDashboardChairman, type DashboardData } from "../lib/api";
import { Link } from "react-router-dom";

function trendClass(trend: string) {
  if (trend.startsWith("+")) return "stat-trend up";
  if (trend.startsWith("-")) return "stat-trend down";
  return "stat-trend neutral";
}

function severityBadge(severity: "high" | "medium" | "low") {
  if (severity === "high") return "badge badge-red";
  if (severity === "medium") return "badge badge-yellow";
  return "badge badge-gray";
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

  if (loading) return <div className="state-loading">加载中…</div>;

  if (error || !data) {
    return <div className="alert alert-error" style={{ marginTop: 40 }}>{error || "数据加载失败"}</div>;
  }

  const { cards, queues, profitOverview, riskBoard, aiSummary } = data;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="page-header">
        <div>
          <div className="page-title">董事长驾驶舱</div>
          <div className="page-subtitle">实时经营数据一览</div>
        </div>
        <div className="flex-row">
          <span className="badge badge-blue">{aiSummary.date}</span>
        </div>
      </div>

      {/* KPI 指标卡 */}
      <div className="grid-4">
        {cards.map((card) => (
          <div key={card.key} className="stat-card">
            <div className="stat-label">{card.label}</div>
            <div className="stat-value">
              {card.key !== "risk" ? `¥${card.value}` : card.value}
            </div>
            <div className={trendClass(card.trend)}>{card.trend}</div>
          </div>
        ))}
      </div>

      {/* 队列概览 */}
      <div className="grid-3">
        <div className="stat-card" style={{ textAlign: "center" }}>
          <div className="stat-label">待审批凭证</div>
          <div className="stat-value" style={{ color: "var(--c-warning)" }}>{queues.approvals}</div>
          <div className="stat-trend neutral">需及时处理</div>
        </div>
        <div className="stat-card" style={{ textAlign: "center" }}>
          <div className="stat-label">阻塞任务</div>
          <div className="stat-value" style={{ color: "var(--c-danger)" }}>{queues.blockedTasks}</div>
          <div className="stat-trend down">影响进度</div>
        </div>
        <div className="stat-card" style={{ textAlign: "center" }}>
          <div className="stat-label">逾期任务</div>
          <div className="stat-value" style={{ color: "var(--c-purple)" }}>{queues.overdueTasks}</div>
          <div className="stat-trend neutral">需关注</div>
        </div>
      </div>

      {/* 利润概览 + AI 摘要 */}
      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <span className="card-title">利润与费用概览</span>
          </div>
          <div className="card-body">
            <table className="data-table">
              <tbody>
                <tr>
                  <td className="text-muted">主营收入</td>
                  <td style={{ textAlign: "right" }}>¥{profitOverview.revenue}</td>
                </tr>
                <tr>
                  <td className="text-muted">主营成本</td>
                  <td style={{ textAlign: "right" }}>¥{profitOverview.cost}</td>
                </tr>
                <tr>
                  <td className="text-muted">期间费用</td>
                  <td style={{ textAlign: "right" }}>¥{profitOverview.expense}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600 }}>毛利润</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>¥{profitOverview.grossProfit}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600 }}>净利润</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>¥{profitOverview.netProfit}</td>
                </tr>
                <tr>
                  <td className="text-muted">毛利率</td>
                  <td style={{ textAlign: "right" }}>{profitOverview.grossMargin}</td>
                </tr>
                <tr>
                  <td className="text-muted">净利率</td>
                  <td style={{ textAlign: "right" }}>{profitOverview.netMargin}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">AI 工作摘要</span>
            <span className="badge badge-blue">今日</span>
          </div>
          <div className="card-body" style={{ display: "grid", gap: 10, fontSize: 13.5 }}>
            <div className="flex-between">
              <span className="text-muted">当天新建事项</span>
              <span style={{ fontWeight: 600 }}>{aiSummary.newEvents}</span>
            </div>
            <div className="flex-between">
              <span className="text-muted">当天已过账凭证</span>
              <span style={{ fontWeight: 600 }}>{aiSummary.postedVouchers}</span>
            </div>
            <div className="flex-between">
              <span className="text-muted">待提交税务批次</span>
              <span style={{ fontWeight: 600 }}>{aiSummary.pendingTaxBatches}</span>
            </div>
            <hr className="divider" />
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--c-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              工作亮点
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9, fontSize: 13.5 }}>
              {aiSummary.highlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* 风险与待办 + 执行建议 */}
      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <span className="card-title">风险与待办</span>
          </div>
          <div className="card-body" style={{ display: "grid", gap: 20 }}>
            {[
              { label: "待审批凭证", items: riskBoard.approvals },
              { label: "阻塞任务", items: riskBoard.blockedTasks },
              { label: "逾期任务", items: riskBoard.overdueTasks },
              { label: "风险事项", items: riskBoard.riskEvents }
            ].map(({ label, items }) => (
              <div key={label}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--c-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                  {label}
                </div>
                {items.length ? (
                  <div style={{ display: "grid", gap: 6 }}>
                    {items.map((item) => (
                      <div key={item.id} className="flex-between" style={{ fontSize: 13.5 }}>
                        <Link
                          to={item.route}
                          style={{ color: "var(--c-primary)", textDecoration: "none" }}
                        >
                          {item.title}
                        </Link>
                        <span className={severityBadge(item.severity)}>{item.status}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted text-sm">当前无待处理项</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">执行建议</span>
          </div>
          <div className="card-body">
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 2, fontSize: 13.5 }}>
              <li>优先处理待审批凭证，避免已识别事项长期停留在未过账状态。</li>
              <li>优先清理阻塞和逾期任务，避免影响税务申报与资料归档时效。</li>
              <li>关注主营收入、主营成本和期间费用的变动，及时复核毛利率与净利率。</li>
              <li>对待提交税务批次逐个核对状态，避免跨期积压。</li>
            </ul>
          </div>
        </div>
      </div>

      {/* 快捷入口 */}
      <div className="grid-3">
        {[
          {
            title: "财务报表中心",
            route: "/reports",
            summary: "查看资产负债表、利润表、现金流量表，并按月/季/年切换。",
            badge: "badge-green"
          },
          {
            title: "研发辅助账",
            route: "/rnd",
            summary: "维护研发项目，查看费用化、资本化、工时与加计扣除基数。",
            badge: "badge-blue"
          },
          {
            title: "风险勾稽中心",
            route: "/risk",
            summary: `查看风险发现 ${data.riskCount} 条，并对经营事项触发规则检查。`,
            badge: "badge-red"
          }
        ].map((item) => (
          <div key={item.route} className="card">
            <div className="card-header">
              <span className="card-title">{item.title}</span>
              <span className={`badge ${item.badge}`}>查看</span>
            </div>
            <div className="card-body">
              <p style={{ color: "var(--c-text-muted)", lineHeight: 1.8, margin: "0 0 16px", fontSize: 13.5 }}>
                {item.summary}
              </p>
              <Link
                to={item.route}
                className="btn btn-outline btn-sm"
              >
                进入模块 →
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
