/**
 * 月度结账向导（P0-2 → H2-w2 升级为消费月结编排状态机）
 * route: /close
 * 按当前全局期间调用 getClosePlan(period)，渲染 8 步有序结账流程：
 * 清理未过账 → 计提折旧 → 权责发生制复核 → 票税一致性核对 → 结转损益
 * → 生成期末快照 → 生成申报底稿 → 归档锁账。
 * 前一步未完成，后续步骤恒为 blocked；in_review 需人工确认后才能推进。
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Button, Alert, Spin, Result } from "antd";
import { ReloadOutlined, ExportOutlined } from "@ant-design/icons";
import { toast } from "sonner";
import { PageHeader } from "../components/ui/PageHeader";
import { usePeriod } from "../lib/period-context";
import { getClosePlan } from "../lib/api";
import { ClosePlanBoard } from "./close/ClosePlanBoard";
import type { ClosePlanView } from "./close/closePlanTypes";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "加载月结编排状态失败";
}

export function MonthEndClosePage() {
  const { period } = usePeriod();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<ClosePlanView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getClosePlan(period);
      setPlan(res.plan as unknown as ClosePlanView);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section className="v3-hero-shell">
        <PageHeader
          title={`月度结账 · ${period}`}
          subtitle="按顺序完成各步：前置步骤未完成则后续步骤锁定。顶栏可切换会计期间，切换后自动重新加载。"
          actions={<Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>刷新</Button>}
        />
      </section>

      {loading && !plan ? (
        <div style={{ padding: 40, textAlign: "center" }}><Spin /></div>
      ) : error ? (
        <Alert
          type="error"
          showIcon
          message="加载月结编排状态失败"
          description={error}
          action={<Button size="small" onClick={() => void load()}>重试</Button>}
        />
      ) : !plan ? null : plan.overall === "completed" ? (
        <Card style={{ borderRadius: 12 }}>
          <Result
            status="success"
            title={`${period} 已完成月度结账并归档锁账`}
            subTitle="账期已锁定保护。如需调整，请在总账中心解锁。"
            extra={
              <Button type="primary" icon={<ExportOutlined />} onClick={() => navigate("/export-center")}>
                前往导出中心
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="v3-workbench-card">
          <section className="v3-section-shell">
            <ClosePlanBoard plan={plan} />
          </section>
        </div>
      )}
    </div>
  );
}
