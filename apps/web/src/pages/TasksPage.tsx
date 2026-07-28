/**
 * 任务中心（V10 车道 G1：横幅收敛 + 流程可见）。
 *
 * 改造前首屏 8 块、9 处 Alert：逾期横幅、未开始横幅、事项过滤横幅、业务指引横幅
 * 四条并排，下面还压着一整块运维视角的运行态面板，帮助浮层里又叠 3 条 Alert。
 * 横幅堆叠的结果是用户把它们全部略过。
 *
 * 收敛口径：凡是页头已经用标签/按钮表达过的（逾期数、待开始数），横幅一律删；
 * 属于一次性用法说明的（拖拽推进）收进帮助面板；只有「当前被过滤到某个事项」
 * 这种真实上下文留下来，并降级成一行可跳转的上下文条。真实的业务指引仍然保留，
 * 但移进任务列表内部——它讲的是列表里这些任务该怎么办，不该另占一条全宽横幅。
 *
 * 这一页只承载一件事（推进任务），看板与列表是同一件事的两种视图，
 * 因此不套 TaskFocusShell；「这个任务走到哪了」在详情抽屉里由 ObjectFlowBar 表达。
 */
import { useEffect, useRef, useState, useMemo } from "react";
import { PageHeader } from "../components/ui/PageHeader";
import { useLocation, useNavigate } from "react-router-dom";
import { Card, Space, Tag, Alert, Tooltip, Button, Segmented, Skeleton, Typography } from "antd";
import {
  ClockCircleOutlined, ExclamationCircleOutlined, QuestionCircleOutlined,
  AppstoreOutlined, UnorderedListOutlined,
} from "@ant-design/icons";
import { toast } from "sonner";
import type { Task, TaskStatus } from "@finance-taxation/domain-model";
import { listTasks, remindTask, updateTaskStatus } from "../lib/api";
import { TASK_STATUS_LABELS } from "../lib/i18n";
import { buildResultPageSubtitle } from "../lib/entry-guidance";
import { normalizeDrilldownState } from "./drilldown";
import { EntityLink } from "../components/ui/EntityLink";
import { useQueryState } from "../hooks/useQueryState";
import { TaskKanbanView } from "./tasks/TaskKanbanView";
import { TaskListView } from "./tasks/TaskListView";
import { TaskDrawer } from "./tasks/TaskDrawer";
import { TasksHelpPanel } from "./tasks/TasksHelpPanel";
import { buildTaskFlow, buildTaskFlowTitle, buildTaskRelatedObjects } from "./tasks/task-flow";
import { needsRuntimeAttention } from "../features/runtime/runtime-attention";
import { deriveContractRevenueTaskGuidance } from "./tasks/contract-revenue-task-guidance";
import { derivePurchaseTaskGuidance } from "./tasks/purchase-task-guidance";
import { deriveTravelTaskGuidance } from "./tasks/travel-task-guidance";
import { useAccessUser } from "../features/runtime/useAccessUser";
import { deriveTaskRuntimeSummary } from "../features/runtime/workflow-runtime";
import { WorkflowRuntimePanel } from "../features/runtime/WorkflowRuntimePanel";
import { useWorkflowRuntimeSummary } from "../features/runtime/useWorkflowRuntimeSummary";

const { Text } = Typography;

type TaskWithOverdue = Task & { isOverdue?: boolean };
type ViewMode = "list" | "kanban";

const CONTEXT_BAR_STYLE: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "6px 10px",
  padding: "8px 14px",
  borderRadius: 10,
  background: "rgba(37,99,235,0.06)",
  border: "1px solid rgba(37,99,235,0.16)",
  fontSize: 13
};

const DETAILS_SUMMARY_STYLE: React.CSSProperties = {
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  color: "#4d5d6c"
};

export function TasksPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const navState = normalizeDrilldownState(location.state);
  const navEventId = navState.businessEventId ?? null;
  /**
   * 从别处点「任务」链接过来时，本页要真的定位到那一条任务。
   * 任务没有独立详情路由，DrilldownState 也没有 taskId 字段，
   * 因此复用既有的 resourceType / resourceId 约定（EntityLink 一定会带上）。
   */
  const navTaskId = navState.resourceType === "task" ? navState.resourceId ?? null : null;

  const [tasks, setTasks] = useState<TaskWithOverdue[]>([]);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [runtimeActionKey, setRuntimeActionKey] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [detailTask, setDetailTask] = useState<TaskWithOverdue | null>(null);
  const [viewStr, setViewStr] = useQueryState("view", "kanban");
  const viewMode = (viewStr === "list" ? "list" : "kanban") as ViewMode;

  async function loadTasks(onlyOverdue: boolean) {
    setLoading(true);
    try {
      const payload = await listTasks(navEventId || undefined, onlyOverdue);
      setTasks(payload.items);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadTasks(false); }, [navEventId]);

  // 只在首次匹配到目标任务时打开抽屉：用户关掉后不应被状态更新重新弹开。
  const openedNavTaskIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!navTaskId || openedNavTaskIdRef.current === navTaskId) {
      return;
    }
    const target = tasks.find((task) => task.id === navTaskId);
    if (!target) {
      return;
    }
    openedNavTaskIdRef.current = navTaskId;
    setDetailTask(target);
  }, [navTaskId, tasks]);

  async function handleStatusChange(taskId: string, newStatus: TaskStatus) {
    setUpdatingId(taskId);
    try {
      await updateTaskStatus(taskId, newStatus);
      setTasks(prev =>
        prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t)
      );
      const label = TASK_STATUS_LABELS[newStatus] ?? newStatus;
      toast.success(`任务已更新为「${label}」`);
      if (detailTask?.id === taskId) {
        setDetailTask(prev => prev ? { ...prev, status: newStatus } : null);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleRemind(taskId: string) {
    setRemindingId(taskId);
    try {
      await remindTask(taskId);
      toast.success("催办通知已发送");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRemindingId(null);
    }
  }

  const overdueCount = useMemo(() => tasks.filter(t => t.isOverdue).length, [tasks]);
  const notStartedCount = useMemo(() => tasks.filter(t => t.status === "not_started").length, [tasks]);
  const purchaseGuidance = useMemo(() => derivePurchaseTaskGuidance(tasks), [tasks]);
  const travelGuidance = useMemo(() => deriveTravelTaskGuidance(tasks), [tasks]);
  const contractGuidance = useMemo(() => deriveContractRevenueTaskGuidance(tasks), [tasks]);
  const workflowGuidance = purchaseGuidance ?? travelGuidance ?? contractGuidance;
  const accessUser = useAccessUser();
  const localRuntimeSummary = useMemo(
    () => deriveTaskRuntimeSummary(tasks, accessUser?.roleIds ?? []),
    [accessUser?.roleIds, tasks]
  );
  const runtimeSummary = useWorkflowRuntimeSummary(
    "tasks",
    { businessEventId: navEventId ?? undefined },
    localRuntimeSummary
  );
  const runtimeAttention = needsRuntimeAttention(runtimeSummary);

  const detailFlow = useMemo(
    () => buildTaskFlow({ task: detailTask, allTasks: tasks }),
    [detailTask, tasks]
  );
  const detailRelated = useMemo(
    () => buildTaskRelatedObjects({ task: detailTask, allTasks: tasks }),
    [detailTask, tasks]
  );

  async function handleRuntimeAction(action: NonNullable<typeof runtimeSummary.actions>[number]) {
    if (action.key !== "retry-blocked-task" || !action.params?.taskId) {
      return;
    }
    setRuntimeActionKey(action.key);
    try {
      await updateTaskStatus(action.params.taskId, "not_started");
      await loadTasks(overdueOnly);
      toast.success("已重开阻塞任务，当前可继续补资料或重新推进。");
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setRuntimeActionKey(null);
    }
  }

  function openEventScoped(path: string, businessEventId: string) {
    navigate(path, { state: { businessEventId } });
  }

  const runtimePanel = (
    <WorkflowRuntimePanel
      title="任务运行态与授权态"
      summary={runtimeSummary}
      onAction={(action) => void handleRuntimeAction(action)}
      busyActionKey={runtimeActionKey}
    />
  );

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {/* 1. 页头：逾期/待开始的数量、仅逾期筛选、视图切换、帮助，都在这里 */}
      <section className="v3-hero-shell">
        <PageHeader
          title="任务中心"
          subtitle={buildResultPageSubtitle("任务中心")}
          actions={(
            <Space wrap>
              {notStartedCount > 0 && (
                <Tag icon={<ClockCircleOutlined />} color="blue">{notStartedCount} 待开始</Tag>
              )}
              {overdueCount > 0 && (
                <Tag icon={<ExclamationCircleOutlined />} color="error">{overdueCount} 逾期</Tag>
              )}
              <Button
                type={overdueOnly ? "primary" : "default"}
                danger={overdueOnly}
                size="small"
                onClick={() => {
                  const next = !overdueOnly;
                  setOverdueOnly(next);
                  void loadTasks(next);
                }}
              >
                {overdueOnly ? "显示全部" : "仅看逾期"}
              </Button>
              <Segmented
                size="small"
                value={viewMode}
                onChange={v => setViewStr(v as ViewMode)}
                options={[
                  { value: "kanban", icon: <AppstoreOutlined />, label: "看板" },
                  { value: "list",   icon: <UnorderedListOutlined />, label: "列表" },
                ]}
                aria-label="视图切换"
              />
              <Tooltip title="操作说明">
                <Button
                  shape="circle"
                  size="small"
                  icon={<QuestionCircleOutlined />}
                  onClick={() => setHelpOpen(true)}
                  aria-label="任务说明"
                />
              </Tooltip>
            </Space>
          )}
        />
      </section>

      {/* 2. 上下文条：只在被某个事项过滤时出现，取代原来的全宽 Alert 横幅 */}
      {navEventId && (
        <div style={CONTEXT_BAR_STYLE} data-testid="tasks-context-bar">
          <Text style={{ fontSize: 13 }}>当前只看事项</Text>
          <EntityLink kind="business_event" id={navEventId} />
          <Text type="secondary" style={{ fontSize: 12 }}>的关联任务</Text>
          <Button type="link" size="small" style={{ padding: 0 }} onClick={() => navigate("/tasks")}>
            查看全部任务
          </Button>
        </div>
      )}

      {/* 3. 运行态：只有确有异常/待授权时才占位，正常时收进下面的折叠区 */}
      {runtimeAttention && runtimePanel}

      {/* 4. 任务列表（业务指引作为列表内的行内提示，不再另起横幅） */}
      <Card
        title={
          <Space>
            <Text strong>任务列表</Text>
            <Tag>{tasks.length}</Tag>
          </Space>
        }
        styles={{ body: { padding: viewMode === "kanban" ? 16 : 0 } }}
        style={{ borderRadius: 12 }}
      >
        {workflowGuidance && (
          <Alert
            type={workflowGuidance.tone === "error" ? "error" : "warning"}
            showIcon
            style={{ margin: viewMode === "kanban" ? "0 0 16px" : "16px 16px 0", borderRadius: 8 }}
            message={workflowGuidance.title}
            description={workflowGuidance.message}
          />
        )}
        {loading ? (
          <div style={{ padding: 24 }}>
            <Skeleton active paragraph={{ rows: 6 }} />
          </div>
        ) : viewMode === "kanban" ? (
          <TaskKanbanView
            tasks={tasks}
            onStatusChange={handleStatusChange}
            onSelect={task => setDetailTask(tasks.find(t => t.id === task.id) ?? null)}
          />
        ) : (
          <TaskListView
            tasks={tasks}
            updatingId={updatingId}
            remindingId={remindingId}
            onStatusChange={handleStatusChange}
            onRemind={handleRemind}
            onSelect={task => setDetailTask(tasks.find(t => t.id === task.id) ?? null)}
          />
        )}
      </Card>

      {/* 5. 正常时收起的运行与授权状态——能力保留，但不占首屏 */}
      {!runtimeAttention && (
        <details className="v3-section-shell" data-tone="muted" style={{ padding: "12px 16px" }}>
          <summary style={DETAILS_SUMMARY_STYLE}>运行与授权状态（当前无异常）</summary>
          <div style={{ marginTop: 12 }}>{runtimePanel}</div>
        </details>
      )}

      {/* 浮层：任务详情与帮助，不占首屏 */}
      <TaskDrawer
        task={detailTask}
        flow={detailFlow}
        flowTitle={buildTaskFlowTitle(detailTask?.title)}
        relatedObjects={detailRelated}
        updatingId={updatingId}
        remindingId={remindingId}
        onClose={() => setDetailTask(null)}
        onStatusChange={handleStatusChange}
        onRemind={handleRemind}
        onOpenDocuments={(eventId) => openEventScoped("/bills", eventId)}
        onOpenTax={(eventId) => openEventScoped("/tax", eventId)}
        onOpenVouchers={(eventId) => openEventScoped("/vouchers", eventId)}
      />

      <TasksHelpPanel open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
