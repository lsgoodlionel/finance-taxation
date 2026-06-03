/**
 * 我的一天 · 统一待办收件箱（P0-3）
 * route: /inbox
 * 聚合全模块待处理事项，一键直达。打开系统先看「今天要干什么」。
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Row, Col, Button, Tag, Space, Typography, Statistic, Alert, Spin, Empty } from "antd";
import {
  ReloadOutlined, RightOutlined, FireOutlined, InboxOutlined, CalendarOutlined,
} from "@ant-design/icons";
import { toast } from "sonner";
import { PageHeader } from "../components/ui/PageHeader";
import { getInbox, getSetupStatus, getTaxDeadlines, type InboxItem, type SetupItem, type TaxDeadline } from "../lib/api";
import { usePeriod } from "../lib/period-context";

const { Text } = Typography;

export function MyDayPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [totalPending, setTotalPending] = useState(0);
  const [setup, setSetup] = useState<{ items: SetupItem[]; doneCount: number; total: number; ready: boolean } | null>(null);
  const [deadlines, setDeadlines] = useState<TaxDeadline[]>([]);
  const [loading, setLoading] = useState(true);
  const { period } = usePeriod();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, setupData, dl] = await Promise.all([
        getInbox(), getSetupStatus().catch(() => null), getTaxDeadlines(period).catch(() => null),
      ]);
      setItems(data.items);
      setTotalPending(data.totalPending);
      setSetup(setupData);
      setDeadlines(dl?.deadlines ?? []);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { void load(); }, [load]);

  const active = items.filter((i) => i.count > 0);
  const urgent = active.filter((i) => i.tone === "warning");

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section className="v3-hero-shell">
        <PageHeader
          title="我的一天"
          subtitle="全模块待办一处汇总，按优先级处理，点卡片直达对应中心。"
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
          <Col span={8}><Statistic title="待办总数" value={totalPending} prefix={<InboxOutlined />} /></Col>
          <Col span={8}><Statistic title="紧急（逾期/风险）" value={urgent.reduce((s, i) => s + i.count, 0)}
            prefix={<FireOutlined />} valueStyle={{ color: urgent.length ? "#dc2626" : "#16a34a" }} /></Col>
          <Col span={8}><Statistic title="待办类别" value={active.length} suffix={`/ ${items.length}`} /></Col>
        </Row>
      </section>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center" }}><Spin /></div>
      ) : active.length === 0 ? (
        <Card style={{ borderRadius: 12 }}>
          <Empty description="太棒了，当前没有待办事项 🎉" />
        </Card>
      ) : (
        <>
          {urgent.length > 0 && (
            <Alert type="warning" showIcon
              message={`有 ${urgent.reduce((s, i) => s + i.count, 0)} 项紧急待办（${urgent.map((i) => i.label).join("、")}），建议优先处理。`} />
          )}
          <section className="v3-section-shell">
            <Row gutter={[16, 16]}>
              {active.map((it) => (
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
        </>
      )}
    </div>
  );
}
