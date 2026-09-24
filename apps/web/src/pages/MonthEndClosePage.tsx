/**
 * 月度结账向导（P0-2 → H2-w2 升级为消费月结编排状态机）
 * route: /close
 * 按当前全局期间调用 getClosePlan(period)，渲染 11 步有序结账流程：
 * 清理未过账 → 工资确认 → 社保关账 → 计提折旧 → 银行对账 → 权责发生制复核
 * → 票税一致性核对 → 结转损益 → 生成期末快照 → 生成申报底稿 → 归档锁账。
 * （V12-C5：前三步之外的工资/社保/银行对账自旧 /api/close/status 清单并入，
 * 该清单已删除，月结状态自此只有一个来源。）
 * 前一步未完成，后续步骤恒为 blocked；in_review 需人工确认后才能推进。
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Button, Alert, Spin, Result } from "antd";
import { ReloadOutlined, ExportOutlined } from "@ant-design/icons";
import { toast } from "sonner";
import { PageHeader } from "../components/ui/PageHeader";
import { ProPageBanner } from "../components/ui/ProPageBanner";
import { Term } from "../components/ui/Term";
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
      <ProPageBanner
        pageName="月度结账"
        plain="月底把这个月的账封口的流程：清完没入账的单子、计提、结转、最后锁账，前一步没做完后面就一直锁着。这是财务每月的例行工作，您在这里不需要点任何按钮。"
      />
      <section className="v3-hero-shell">
        <PageHeader
          title={`月度结账 · ${period}`}
          subtitle="按顺序完成各步：前置步骤未完成则后续步骤锁定。顶栏可切换会计期间，切换后自动重新加载。"
          actions={(
            <>
              <Button icon={<ReloadOutlined />} onClick={() => void load()} loading={loading}>刷新</Button>
            </>
          )}
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
