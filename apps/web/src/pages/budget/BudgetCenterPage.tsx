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
import { Alert, Button, DatePicker, Empty, Skeleton, Space, Typography } from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { toast } from "sonner";
import { PageHeader } from "../../components/ui/PageHeader";
import { TaskFocusShell } from "../../components/ui/TaskFocusShell";
import { errorMessage } from "../../lib/errors";
import { listCostCenters } from "../../lib/api";
import {
  createBudget,
  getExpenseAnalysis,
  listBudgets,
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
              <BudgetTable items={items} costCenterNames={costCenterNames} />
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
    </div>
  );
}
