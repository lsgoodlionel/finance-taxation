/**
 * 我的一天 · 统一收件箱工作台（G3 inbox-first）
 * route: /inbox
 * 聚合四类待办卡片：待办任务 / 风险预警 / 审批请求 / AI 草稿（Stage H 占位）。
 * 打开系统先看「今天要干什么」，点卡片直达对应中心处理。
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Row, Col, Button, Tag, Space, Typography, Statistic, Alert, Spin, Empty } from "antd";
import {
  ReloadOutlined, RightOutlined, FireOutlined, InboxOutlined, CalendarOutlined,
} from "@ant-design/icons";
import { toast } from "sonner";
import type { RiskFinding, WorkflowRun } from "@finance-taxation/domain-model";
import { PageHeader } from "../components/ui/PageHeader";
import {
  getInbox, getSetupStatus, getTaxDeadlines, listRiskFindings, listTasks, listWorkflowRuns,
  type InboxItem, type SetupItem, type TaxDeadline,
} from "../lib/api";
import { usePeriod } from "../lib/period-context";
import { InboxTasksCard } from "./inbox/InboxTasksCard";
import { InboxRiskCard } from "./inbox/InboxRiskCard";
import { InboxApprovalsCard } from "./inbox/InboxApprovalsCard";
import { InboxAiDraftsCard } from "./inbox/InboxAiDraftsCard";
import type { TaskWithOverdue } from "./inbox/inbox-helpers";

const { Text } = Typography;

// 已由「待办任务」专属卡片覆盖，通用列表中不再重复展示
const TASK_INBOX_KEYS = new Set(["overdue_tasks", "todo_tasks"]);

export function MyDayPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [totalPending, setTotalPending] = useState(0);
  const [setup, setSetup] = useState<{ items: SetupItem[]; doneCount: number; total: number; ready: boolean } | null>(null);
  const [deadlines, setDeadlines] = useState<TaxDeadline[]>([]);
  const [tasks, setTasks] = useState<TaskWithOverdue[]>([]);
  const [riskFindings, setRiskFindings] = useState<RiskFinding[]>([]);
  const [approvalRuns, setApprovalRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const { period } = usePeriod();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, setupData, dl, taskData, riskData, runData] = await Promise.all([
        getInbox(),
        getSetupStatus().catch(() => null),
        getTaxDeadlines(period).catch(() => null),
        listTasks().catch(() => null),
        listRiskFindings().catch(() => null),
        listWorkflowRuns({ state: "awaiting_authorization" }).catch(() => null),
      ]);
      setItems(data.items);
      setTotalPending(data.totalPending);
      setSetup(setupData);
      setDeadlines(dl?.deadlines ?? []);
      setTasks(taskData?.items ?? []);
      setRiskFindings(riskData?.items ?? []);
      setApprovalRuns(runData?.items ?? []);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { void load(); }, [load]);

  const otherItems = items.filter((i) => i.count > 0 && !TASK_INBOX_KEYS.has(i.key));
  const otherUrgent = otherItems.filter((i) => i.tone === "warning");
  const overdueTaskCount = tasks.filter((t) => t.isOverdue).length;
  const openHighRiskCount = riskFindings.filter((f) => f.status === "open" && f.severity === "high").length;
  const urgentTotal = overdueTaskCount + openHighRiskCount + otherUrgent.reduce((s, i) => s + i.count, 0);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section className="v3-hero-shell">
        <PageHeader
          title="我的一天"
          subtitle="收件箱一处汇总待办任务、风险预警、审批请求与 AI 草稿，按优先级处理，点卡片直达对应中心。"
          actions={(
            <Space>
              <Button icon={<CalendarOutlined />} onClick={() => navigate("/close")}>月度结账</Button>
              <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
            </Space>
          )}
        />
      </section>

      {setup && !setup.ready && (
        <section className="v3-section-shell" data-tone="muted">
          <Space direction="vertical" size={10} style={{ width: "100%" }}>
            <Space style={{ justifyContent: "space-between", width: "100%" }}>
              <Text strong>🚀 快速开始（{setup.doneCount}/{setup.total} 已完成）</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>完成基础配置后即可顺畅跑通日常财税</Text>
            </Space>
            <Row gutter={[12, 12]}>
              {setup.items.map((s) => (
                <Col key={s.key} xs={24} sm={12} lg={8}>
                  <div onClick={() => !s.done && navigate(s.actionPath)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                      borderRadius: 10, border: "1px solid rgba(20,40,60,0.08)",
                      background: s.done ? "rgba(22,163,74,0.06)" : "#fff",
                      cursor: s.done ? "default" : "pointer", opacity: s.done ? 0.75 : 1,
                    }}>
                    <span style={{ fontSize: 16 }}>{s.done ? "✅" : "⬜"}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text strong={!s.done} delete={s.done} style={{ fontSize: 13 }}>{s.label}</Text>
                      {!s.done && <div style={{ fontSize: 11, color: "#94a3b8" }}>{s.hint}</div>}
                    </div>
                    {!s.done && <RightOutlined style={{ color: "#94a3b8", fontSize: 11 }} />}
                  </div>
                </Col>
              ))}
            </Row>
          </Space>
        </section>
      )}

      {deadlines.length > 0 && (
        <section className="v3-section-shell">
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            <Text strong>📅 申报到期提醒（{period}）</Text>
            <Row gutter={[12, 12]}>
              {deadlines.map((d) => (
                <Col key={d.taxType} xs={24} sm={12} lg={6}>
                  <Card size="small" style={{ borderRadius: 10, borderLeft: `3px solid ${d.filed ? "#16a34a" : d.urgent ? "#dc2626" : "#2563eb"}` }}
                    styles={{ body: { padding: "10px 14px" } }}>
                    <Text strong style={{ fontSize: 13 }}>{d.label}</Text>
                    <div style={{ fontSize: 11, color: "#94a3b8", margin: "2px 0" }}>截止 {d.dueDate}</div>
                    {d.filed
                      ? <Tag color="success">已申报</Tag>
                      : d.daysLeft < 0
                        ? <Tag color="error">已逾期 {-d.daysLeft} 天</Tag>
                        : <Tag color={d.urgent ? "error" : "blue"}>剩 {d.daysLeft} 天</Tag>}
                  </Card>
                </Col>
              ))}
            </Row>
          </Space>
        </section>
      )}

      <section className="v3-section-shell" data-tone="accent">
        <Row gutter={16} align="middle">
          <Col span={6}><Statistic title="待办总数" value={totalPending} prefix={<InboxOutlined />} /></Col>
          <Col span={6}><Statistic title="紧急（逾期/高危风险）" value={urgentTotal}
            prefix={<FireOutlined />} valueStyle={{ color: urgentTotal ? "#dc2626" : "#16a34a" }} /></Col>
          <Col span={6}><Statistic title="待审批事项" value={approvalRuns.length}
            valueStyle={{ color: approvalRuns.length ? "#d97706" : undefined }} /></Col>
          <Col span={6}><Statistic title="其他模块待办类别" value={otherItems.length} suffix={`/ ${items.length}`} /></Col>
        </Row>
      </section>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center" }}><Spin /></div>
      ) : (
        <>
          {urgentTotal > 0 && (
            <Alert type="warning" showIcon
              message={`有 ${urgentTotal} 项紧急待办，建议优先处理逾期任务与高危风险。`} />
          )}

          <InboxTasksCard tasks={tasks} loading={loading} />
          <InboxRiskCard findings={riskFindings} loading={loading} />
          <InboxApprovalsCard runs={approvalRuns} loading={loading} />
          <InboxAiDraftsCard />

          {otherItems.length > 0 && (
            <section className="v3-section-shell">
              <Text strong style={{ display: "block", marginBottom: 10 }}>📌 其他模块待办</Text>
              <Row gutter={[16, 16]}>
                {otherItems.map((it) => (
                  <Col key={it.key} xs={24} sm={12} lg={8}>
                    <Card hoverable style={{ borderRadius: 12, borderLeft: `3px solid ${it.tone === "warning" ? "#dc2626" : "#2563eb"}` }}
                      styles={{ body: { padding: "16px 18px" } }}
                      onClick={() => navigate(it.actionPath)}>
                      <Space direction="vertical" size={6} style={{ width: "100%" }}>
                        <Space style={{ justifyContent: "space-between", width: "100%" }}>
                          <Text strong>{it.label}</Text>
                          <Tag color={it.tone === "warning" ? "error" : "blue"}>{it.count}</Tag>
                        </Space>
                        <Text type="secondary" style={{ fontSize: 12 }}>{it.hint}</Text>
                        <Button type="link" size="small" style={{ padding: 0 }}>
                          前往处理 <RightOutlined />
                        </Button>
                      </Space>
                    </Card>
                  </Col>
                ))}
              </Row>
            </section>
          )}

          {totalPending === 0 && tasks.length === 0 && riskFindings.length === 0 && approvalRuns.length === 0 && (
            <Card style={{ borderRadius: 12 }}>
              <Empty description="太棒了，当前没有待办事项 🎉" />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
