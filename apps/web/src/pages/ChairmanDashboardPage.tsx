/**
 * 董事长驾驶舱（V10 车道：按「问题—结论」重排，刻意**不**拆任务切换器）。
 *
 * 不拆任务的四条理由写在 dashboard/chairman-questions.ts 的抬头，一句话概括：
 * 这一页没有工作区可切，把「有 3 张凭证等您审批」收进第二个 tab 等于把整页唯一的
 * 行动信号藏起来——与 /inbox 上一轮保持四张卡并列不拆 tab 是同一个判断。
 *
 * 改造前首屏 6 个平级区块、13 张卡：页头、4 张 KPI、近 6 月收支趋势图、费用构成
 * 饼图、资金前瞻、利润概览、AI 工作摘要、4 张待办卡。区块只有名词标题，没有阅读
 * 顺序，董事长得自己把图看懂再总结出结论。
 *
 * 改造后 5 块：一眼看全的页头 + KPI 条，然后三段各回答副标题里承诺的一个问题
 * （段首先给结论、图表是结论的展开），最后是默认收起的财务过程统计。
 *
 * 顺带删掉了「近 6 月收支趋势」图 —— 它 6 个点里有 5 个是编的：
 *   const factors = [0.72, 0.81, 0.88, 0.94, 0.97, 1.0];
 *   收入: Math.round(revenue * factors[i])
 * 也就是把本月收入乘一组写死的系数当成历史。它必然画出一条单调上升的曲线，
 * 无论公司实际是增长还是下滑，而卡片标题写的是「近 6 月收支趋势」。后端目前没有
 * 按期间的历史收入/成本接口（只有 /api/rnd/trend 是研发专用），要如实画这张图
 * 得先有那个接口。在它出现之前不画——这与后端在风险卡上「与其编一个 +2，不如
 * 明确留白」的处理是同一条纪律（modules/dashboard/routes.ts）。
 */
import React, { useEffect, useState } from "react";
import { Card, Col, Collapse, Row, Space, Tag } from "antd";
import { CheckCircleOutlined, ExclamationCircleOutlined } from "@ant-design/icons";
import { getDashboardChairman, type DashboardData } from "../lib/api";
import { CHAIRMAN_DASHBOARD_SUBTITLE } from "../lib/entry-guidance";
import { useWorkspaceMode } from "../lib/workspace-mode";
import { PageSkeleton } from "../components/ui/PageSkeleton";
import { PageHeader } from "../components/ui/PageHeader";
import { AiSummaryCard } from "./dashboard/AiSummaryCard";
import { CashForecastCard } from "./dashboard/CashForecastCard";
import { DashboardAlertCards } from "./dashboard/DashboardAlertCards";
import { DashboardKpiCards } from "./dashboard/DashboardKpiCards";
import { DashboardPieChart } from "./dashboard/DashboardPieChart";
import { DashboardQuestionSection } from "./dashboard/DashboardQuestionSection";
import { ProfitSummaryCard } from "./dashboard/ProfitSummaryCard";
import { buildChairmanQuestions, type ChairmanQuestion, type ChairmanQuestionKey } from "./dashboard/chairman-questions";

function pickQuestion(questions: readonly ChairmanQuestion[], key: ChairmanQuestionKey): ChairmanQuestion {
  const found = questions.find((question) => question.key === key);
  if (!found) {
    throw new Error(`chairman question not built: ${key}`);
  }
  return found;
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

  const questions = buildChairmanQuestions(data);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {/* 一眼看全：页头 + 四张 KPI。KPI 条留作整体而不打散进三问，
          它就是这一页的摘要行；打散反而要读者在三段里各找一个数字。 */}
      <section className="v3-hero-shell">
        <PageHeader
          title={isGuided ? "经营报告" : "董事长驾驶舱"}
          subtitle={isGuided ? "公司赚不赚钱、钱够不够用、有没有事要您拍板，这一页依次讲清楚。" : CHAIRMAN_DASHBOARD_SUBTITLE}
          actions={(
            <Space>
              <Tag icon={<CheckCircleOutlined />} color="success">系统正常</Tag>
              <Tag color="blue">{data.aiSummary.date}</Tag>
            </Space>
          )}
        />
        <div style={{ marginTop: 20 }}>
          <DashboardKpiCards data={data} />
        </div>
      </section>

      <DashboardQuestionSection question={pickQuestion(questions, "profit")} tone="accent">
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}><ProfitSummaryCard profitOverview={data.profitOverview} /></Col>
          <Col xs={24} lg={12}><DashboardPieChart data={data} /></Col>
        </Row>
      </DashboardQuestionSection>

      <DashboardQuestionSection question={pickQuestion(questions, "cash")}>
        <CashForecastCard />
      </DashboardQuestionSection>

      <DashboardQuestionSection question={pickQuestion(questions, "decisions")}>
        <DashboardAlertCards riskBoard={data.riskBoard} queues={data.queues} />
      </DashboardQuestionSection>

      <section className="v3-section-shell" data-tone="muted">
        <Collapse
          ghost
          items={[{
            key: "finance-detail",
            label: "财务细节（凭证、申报等专业统计，想看再展开）",
            children: <AiSummaryCard aiSummary={data.aiSummary} />
          }]}
        />
      </section>
    </div>
  );
}
