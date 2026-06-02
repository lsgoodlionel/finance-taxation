/**
 * 月度结账向导（P0-2）
 * route: /close
 * 跨模块聚合当前会计期间的结账完成度，按顺序引导：
 * 工资确认 → 社保关账 → 凭证过账 → 银行对账 → 财务报表 → 税务申报 → 期间锁账
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card, Steps, Button, Tag, Space, Typography, Progress, Alert, Spin, Result,
} from "antd";
import {
  CheckCircleFilled, ClockCircleOutlined, RightOutlined, ReloadOutlined, LockOutlined,
} from "@ant-design/icons";
import { toast } from "sonner";
import { PageHeader } from "../components/ui/PageHeader";
import { usePeriod } from "../lib/period-context";
import { getCloseStatus, type CloseStep } from "../lib/api";

const { Text } = Typography;

const STATUS_META: Record<CloseStep["status"], { color: string; label: string }> = {
  done:    { color: "success", label: "已完成" },
  pending: { color: "processing", label: "待处理" },
  todo:    { color: "default", label: "未开始" },
};

export function MonthEndClosePage() {
  const { period } = usePeriod();
  const navigate = useNavigate();
  const [steps, setSteps] = useState<CloseStep[]>([]);
  const [doneCount, setDoneCount] = useState(0);
  const [canLock, setCanLock] = useState(false);
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCloseStatus(period);
      setSteps(data.steps);
      setDoneCount(data.doneCount);
      setCanLock(data.canLock);
      setLocked(data.locked);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { void load(); }, [load]);

  const total = steps.length || 7;
  const percent = Math.round((doneCount / total) * 100);
  const currentIdx = steps.findIndex((s) => s.status !== "done");

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section className="v3-hero-shell">
        <PageHeader
          title={`月度结账 · ${period}`}
          subtitle="一条动线走完月结：工资 → 社保 → 凭证 → 对账 → 报表 → 申报 → 锁账。顶栏可切换会计期间。"
          actions={<Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>}
        />
      </section>

      <section className="v3-section-shell" data-tone="accent">
        <Space align="center" size={24} style={{ width: "100%", justifyContent: "space-between", flexWrap: "wrap" }}>
          <Space direction="vertical" size={0}>
            <Text strong style={{ fontSize: 15 }}>结账进度</Text>
            <Text type="secondary" style={{ fontSize: 13 }}>{doneCount} / {total} 步已完成</Text>
          </Space>
          <Progress percent={percent} style={{ flex: 1, minWidth: 200, maxWidth: 480 }}
            status={locked ? "success" : "active"} />
          {locked
            ? <Tag icon={<LockOutlined />} color="success">本期已锁账</Tag>
            : canLock
              ? <Tag color="processing">可锁账</Tag>
              : <Tag icon={<ClockCircleOutlined />}>进行中</Tag>}
        </Space>
      </section>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center" }}><Spin /></div>
      ) : locked ? (
        <Card style={{ borderRadius: 12 }}>
          <Result status="success" title={`${period} 已完成月度结账并锁账`}
            subTitle="账期已锁定保护。如需调整，请在总账中心解锁。"
            extra={<Button type="primary" onClick={() => navigate("/ledger")}>前往总账中心</Button>} />
        </Card>
      ) : (
        <div className="v3-result-grid v3-result-grid--wide">
          <div className="v3-workbench-card">
            <section className="v3-section-shell">
              <Steps direction="vertical" size="small" current={currentIdx < 0 ? steps.length : currentIdx}
                items={steps.map((s) => ({
                  title: (
                    <Space>
                      <span>{s.label}</span>
                      <Tag color={STATUS_META[s.status].color}>{STATUS_META[s.status].label}</Tag>
                      {s.count > 0 && s.status === "pending" && <Tag color="orange">{s.count}</Tag>}
                    </Space>
                  ),
                  description: (
                    <Space split="·">
                      <Text type="secondary" style={{ fontSize: 12 }}>{s.detail}</Text>
                      <Button type="link" size="small" style={{ padding: 0 }}
                        onClick={() => navigate(s.actionPath)}>
                        前往处理 <RightOutlined />
                      </Button>
                    </Space>
                  ),
                  icon: s.status === "done" ? <CheckCircleFilled style={{ color: "#16a34a" }} /> : undefined,
                }))} />
            </section>
          </div>

          <div className="v3-workbench-card">
            <section className="v3-section-shell">
              <Space direction="vertical" size={12} style={{ width: "100%" }}>
                <Text strong>本期待办提示</Text>
                {steps.filter((s) => s.status !== "done").length === 0 ? (
                  <Alert type="success" showIcon message="所有结账步骤已完成，可前往总账中心锁定账期。" />
                ) : (
                  steps.filter((s) => s.status !== "done").map((s) => (
                    <Alert key={s.key} type={s.status === "pending" ? "warning" : "info"} showIcon
                      message={<Space style={{ justifyContent: "space-between", width: "100%" }}>
                        <span>{s.label}：{s.detail}</span>
                        <Button type="link" size="small" onClick={() => navigate(s.actionPath)}>处理</Button>
                      </Space>} />
                  ))
                )}
                {canLock && (
                  <Button type="primary" icon={<LockOutlined />} block onClick={() => navigate("/ledger")}>
                    前往总账中心锁定账期
                  </Button>
                )}
              </Space>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
