/**
 * 预算中心（V13-A2）。
 *
 * 两件事：**看执行**与**立预算**。用 TaskFocusShell 一次只渲染一件，
 * 与 /rnd、/tax 同构——预算页最容易长成「一张大表 + 五个折叠面板」，
 * 而用户来这里通常只为其中一件事。
 *
 * 期间筛选写进 URL：会计对着预算表讨论时要能把链接发给别人。
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Alert, Button, DatePicker, Empty, InputNumber, Modal, Radio, Skeleton, Space, Typography } from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { toast } from "sonner";
import { PageHeader } from "../../components/ui/PageHeader";
import { TaskFocusShell } from "../../components/ui/TaskFocusShell";
import { errorMessage } from "../../lib/errors";
import { listCostCenters } from "../../lib/api";
import {
  createBudget,
  deleteBudget,
  getExpenseAnalysis,
  listBudgets,
  updateBudget,
  type BudgetWithUsage,
  type CreateBudgetBody,
  type ExpenseAnalysis
} from "../../lib/api-expense-control";
import { ExpenseAnalysisPanel } from "./ExpenseAnalysisPanel";
import { BudgetCreateForm, type CostCenterOption } from "./BudgetCreateForm";
import { BudgetTable } from "./BudgetTable";
import { countOverruns } from "./budget-view";

const TASK_KEYS = ["review", "create", "analysis"] as const;
type BudgetTaskKey = (typeof TASK_KEYS)[number];

function isTaskKey(value: string | null): value is BudgetTaskKey {
  return value !== null && (TASK_KEYS as readonly string[]).includes(value);
}

export function BudgetCenterPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<BudgetWithUsage[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ExpenseAnalysis | null>(null);
  const [adjusting, setAdjusting] = useState<BudgetWithUsage | null>(null);
  const [adjustYuan, setAdjustYuan] = useState(0);
  const [adjustPolicy, setAdjustPolicy] = useState<"block" | "warn">("warn");
  const [analysisLoading, setAnalysisLoading] = useState(false);

  const task: BudgetTaskKey = isTaskKey(searchParams.get("task"))
    ? (searchParams.get("task") as BudgetTaskKey)
    : "review";
  const period = searchParams.get("period");

  const setTask = useCallback(
    (next: BudgetTaskKey) => {
      const params = new URLSearchParams(searchParams);
      params.set("task", next);
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await listBudgets(period ?? undefined);
      setItems(data.items);
    } catch (error) {
      // 不静默：加载失败要说出来，否则空列表会被读成「还没立预算」，
      // 而用户据此又立一遍已经存在的预算，撞上重复约束再被拒。
      setLoadError(errorMessage(error, "预算加载失败，请重试"));
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    // 成本中心只为把维度显示成人话，取不到不影响主流程——失败时静默降级
    // 成显示 id，不打断用户。
    listCostCenters()
      .then((data) => setCostCenters(data.items.map((item) => ({ id: item.id, name: item.name }))))
      .catch(() => setCostCenters([]));
  }, []);

  const costCenterNames = useMemo(
    () => Object.fromEntries(costCenters.map((item) => [item.id, item.name])),
    [costCenters]
  );

  const overrunCount = useMemo(() => countOverruns(items), [items]);

  // 费用构成按需加载：它查的是报销单，与预算列表是两套数据，
  // 没切到那件事就不该多跑一次查询。
  useEffect(() => {
    if (task !== "analysis") return;
    const analysisPeriod = period ?? dayjs().format("YYYY-MM");
    setAnalysisLoading(true);
    getExpenseAnalysis(analysisPeriod)
      .then(setAnalysis)
      .catch((error) => toast.error(errorMessage(error, "费用分析加载失败")))
      .finally(() => setAnalysisLoading(false));
  }, [task, period]);

  const handleCreate = async (body: CreateBudgetBody) => {
    setSubmitting(true);
    try {
      await createBudget(body);
      toast.success("预算已建立");
      setTask("review");
      await reload();
    } catch (error) {
      toast.error(errorMessage(error, "预算建立失败"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdjust = async () => {
    if (!adjusting) return;
    try {
      await updateBudget(adjusting.id, {
        amountCents: Math.round(adjustYuan * 100),
        controlPolicy: adjustPolicy
      });
      toast.success("额度已调整");
      setAdjusting(null);
      await reload();
    } catch (error) {
      toast.error(errorMessage(error, "调整失败"));
    }
  };

  const handleDelete = (budget: BudgetWithUsage) => {
    Modal.confirm({
      title: "删除这条预算？",
      // 有未结占用时服务端会拒——不在这里预判，因为占用状态随时在变，
      // 前端判断只会给出一个可能已经过时的结论。
      content:
        "如果还有未结束的占用（已批但没落账的单据），服务端会拒绝删除。" +
        "删除后这个维度的支出不再受预算控制。",
      okText: "删除",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await deleteBudget(budget.id);
          toast.success("预算已删除");
          await reload();
        } catch (error) {
          toast.error(errorMessage(error, "删除失败"));
        }
      }
    });
  };

  const handlePeriodChange = (value: dayjs.Dayjs | null) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set("period", value.format("YYYY-MM"));
    else params.delete("period");
    setSearchParams(params, { replace: true });
  };

  return (
    <div>
      <PageHeader
        title="预算中心"
        subtitle="预算额、已占用、已实际发生——三个数一起看，才知道还能批多少"
        actions={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void reload()}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setTask("create")}>
              立预算
            </Button>
          </Space>
        }
      />

      {loadError && (
        <Alert
          type="error"
          showIcon
          message="预算加载失败"
          description={loadError}
          style={{ marginBottom: 16 }}
          action={
            <Button size="small" onClick={() => void reload()}>
              重试
            </Button>
          }
        />
      )}

      {overrunCount > 0 && (
        <Alert
          type="warning"
          showIcon
          message={`有 ${overrunCount} 条预算已超支`}
          description="超支金额照实显示为负数。要么追加预算，要么处理掉占用它的单据。"
          style={{ marginBottom: 16 }}
        />
      )}

      <TaskFocusShell
        tasks={[
          { key: "review", label: "看执行", description: "各条预算用到哪一步了" },
          {
            key: "create",
            label: "立预算",
            description: "按期间、部门、科目定额度"
          },
          {
            key: "analysis",
            label: "看构成",
            description: "报销的钱花在哪个部门、哪类费用、谁报的"
          }
        ]}
        activeKey={task}
        onSelectTask={(key) => setTask(key as BudgetTaskKey)}
        switcherLabel="预算中心任务"
      >
        {task === "analysis" ? (
          analysisLoading ? (
            <Skeleton active paragraph={{ rows: 5 }} />
          ) : analysis ? (
            <ExpenseAnalysisPanel analysis={analysis} />
          ) : (
            <Empty description="暂无费用数据" />
          )
        ) : task === "review" ? (
          <div>
            <Space style={{ marginBottom: 12 }}>
              <Typography.Text type="secondary">期间</Typography.Text>
              <DatePicker
                picker="month"
                allowClear
                value={period ? dayjs(period, "YYYY-MM") : null}
                onChange={handlePeriodChange}
                placeholder="全部期间"
              />
            </Space>
            {loading ? (
              <Skeleton active paragraph={{ rows: 4 }} />
            ) : items.length === 0 && !loadError ? (
              <Empty description="还没有预算。先立一条，超支才拦得住。">
                <Button type="primary" onClick={() => setTask("create")}>
                  立第一条预算
                </Button>
              </Empty>
            ) : (
              <BudgetTable
                items={items}
                costCenterNames={costCenterNames}
                onAdjust={(budget) => {
                  setAdjustYuan(budget.amountCents / 100);
                  setAdjustPolicy(budget.controlPolicy);
                  setAdjusting(budget);
                }}
                onDelete={handleDelete}
              />
            )}
          </div>
        ) : (
          <BudgetCreateForm
            costCenters={costCenters}
            submitting={submitting}
            onSubmit={(body) => void handleCreate(body)}
          />
        )}
      </TaskFocusShell>

      <Modal
        open={adjusting !== null}
        title="调整预算额度"
        okText="保存"
        cancelText="取消"
        onCancel={() => setAdjusting(null)}
        onOk={() => void handleAdjust()}
      >
        {adjusting && (
          <div>
            <Typography.Paragraph>
              {adjusting.periodKey} · {adjusting.accountCode ?? "不限科目"}
              <br />
              当前已占用 <strong>{(adjusting.encumberedCents / 100).toFixed(2)}</strong> 元、
              已发生 <strong>{(adjusting.actualCents / 100).toFixed(2)}</strong> 元。
            </Typography.Paragraph>

            <Space direction="vertical" style={{ width: "100%" }}>
              <Space>
                <span>新额度（元）</span>
                <InputNumber
                  min={0}
                  precision={2}
                  value={adjustYuan}
                  onChange={(value) => setAdjustYuan(value ?? 0)}
                  style={{ width: 180 }}
                />
              </Space>
              <Space>
                <span>超支时</span>
                <Radio.Group
                  value={adjustPolicy}
                  onChange={(e) => setAdjustPolicy(e.target.value)}
                  options={[
                    { label: "提示", value: "warn" },
                    { label: "拦截", value: "block" }
                  ]}
                />
              </Space>
            </Space>

            {/* 调减到低于已用是允许的——年中收紧开支是真实的经营事件，
                拦住它等于要求会计先去撤单据。差额照实显示为超支。 */}
            {Math.round(adjustYuan * 100) < adjusting.encumberedCents + adjusting.actualCents && (
              <Alert
                type="warning"
                showIcon
                style={{ marginTop: 12 }}
                message="新额度低于已用金额"
                description="这是允许的（年中收紧开支很常见），调整后该预算会显示为超支。已有的单据不受影响。"
              />
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
