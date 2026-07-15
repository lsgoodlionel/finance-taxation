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
import { HelpPanel, HelpTriggerButton } from "../components/ui/HelpPanel";
import { Term } from "../components/ui/Term";
import { usePeriod } from "../lib/period-context";
import { getClosePlan } from "../lib/api";
import { ClosePlanBoard } from "./close/ClosePlanBoard";
import type { ClosePlanView } from "./close/closePlanTypes";

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "加载月结编排状态失败";
}

function CloseHelpPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <HelpPanel
      open={open}
      title="月度结账 · 业务关系与操作说明"
      onClose={onClose}
      relations={(
        <>
          <strong>凭证中心</strong>的凭证审核过账、<strong>票据</strong>齐备后，才能开始<strong>月度结账</strong>；结账完成的数据流向<strong>财务报表</strong>、<strong>税务申报</strong>与<strong>归档审计</strong>。
        </>
      )}
      workflowSteps={[
        <>清理未<Term k="posting">过账</Term>事项：把本月挂着没入账的单据处理完，不留尾巴</>,
        <><Term k="accrual">计提</Term><Term k="depreciation">折旧</Term>：给设备等固定资产按月记一笔损耗费用</>,
        <><Term k="accrual-basis">权责发生制</Term>调整复核：该算本月的收入费用都记进本月，不串月</>,
        <><Term k="invoice-tax-consistency">票税一致性</Term>核对：核对发票与税额，账、票、税三方对得上</>,
        <><Term k="close-income">结转损益</Term>：把本月收入费用汇总结转，算出当月盈亏</>,
        <>生成<Term k="period-snapshot">期末财务快照</Term>：给月末账面数据拍一张快照留底</>,
        <>生成<Term k="working-paper">申报底稿</Term>：按结账结果整理出报税用的底稿</>,
        <><Term k="archive">归档</Term><Term k="period-lock">锁账</Term>：资料归档并锁定本月账，防止事后改动</>
      ]}
      responsibility="这里是按月收账的总控页：8 个步骤组成有序的月结状态机，必须按顺序推进——前置步骤未完成时，后续步骤恒为锁定状态，直到全部完成并归档锁账。"
      operations={(
        <>
          标记「需人工确认」的步骤要人工核对后才能继续推进；每个可执行步骤旁有跳转入口，点击即可去对应中心处理；顶栏切换会计期间后本页自动重新加载对应月份的进度。
        </>
      )}
      caution="归档锁账后本期账务不可再修改；如确需调整，须由有权限的人员在总账中心解锁（反结账），操作会留下审计记录。"
    />
  );
}

export function MonthEndClosePage() {
  const { period } = usePeriod();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<ClosePlanView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

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
      <CloseHelpPanel open={showHelp} onClose={() => setShowHelp(false)} />
      <section className="v3-hero-shell">
        <PageHeader
          title={`月度结账 · ${period}`}
          subtitle="按顺序完成各步：前置步骤未完成则后续步骤锁定。顶栏可切换会计期间，切换后自动重新加载。"
          actions={(
            <>
              <HelpTriggerButton onClick={() => setShowHelp(true)} label="查看月度结账操作说明" />
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
