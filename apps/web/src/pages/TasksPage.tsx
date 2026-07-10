import { useEffect, useState, useMemo } from "react";
import { PageHeader } from "../components/ui/PageHeader";
import { useLocation, useNavigate } from "react-router-dom";
import { Card, Space, Tag, Alert, Tooltip, Button, Segmented, Skeleton, Typography } from "antd";
import {
  ClockCircleOutlined, ExclamationCircleOutlined, QuestionCircleOutlined,
  AppstoreOutlined, UnorderedListOutlined, BellOutlined,
} from "@ant-design/icons";
import { toast } from "sonner";
import type { Task, TaskStatus } from "@finance-taxation/domain-model";
import { listTasks, remindTask, type WorkflowRunDetail, updateTaskStatus } from "../lib/api";
import { TASK_STATUS_LABELS } from "../lib/i18n";
import { buildResultPageSubtitle } from "../lib/entry-guidance";
import { normalizeDrilldownState } from "./drilldown";
import { useQueryState } from "../hooks/useQueryState";
import { WorkflowRuntimeCard } from "../components/workflow/WorkflowRuntimeCard";
import { TaskKanbanView } from "./tasks/TaskKanbanView";
import { TaskListView } from "./tasks/TaskListView";
import { TaskDrawer } from "./tasks/TaskDrawer";

const { Title, Text } = Typography;

type TaskWithOverdue = Task & { isOverdue?: boolean };
type ViewMode = "list" | "kanban";

export function TasksPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const navEventId = normalizeDrilldownState(location.state).businessEventId ?? null;

  const [tasks, setTasks] = useState<TaskWithOverdue[]>([]);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [detailTask, setDetailTask] = useState<TaskWithOverdue | null>(null);
  const [runtimeDetail, setRuntimeDetail] = useState<WorkflowRunDetail | null>(null);
  const [viewStr, setViewStr] = useQueryState("view", "kanban");
  const viewMode = (viewStr === "list" ? "list" : "kanban") as ViewMode;

  async function loadTasks(onlyOverdue: boolean) {
    setLoading(true);
    try {
      const payload = await listTasks(navEventId || undefined, onlyOverdue);
      setTasks(payload.items);
      return payload.items;
    } catch (err) {
      toast.error((err as Error).message);
      return null;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadTasks(false); }, [navEventId]);

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

  async function handleRuntimeChanged() {
    const items = await loadTasks(overdueOnly);
    if (detailTask?.id && items) {
      setDetailTask(items.find((task) => task.id === detailTask.id) ?? null);
    }
  }

  const overdueCount = useMemo(() => tasks.filter(t => t.isOverdue).length, [tasks]);
  const notStartedCount = useMemo(() => tasks.filter(t => t.status === "not_started").length, [tasks]);
  const runtimeTaskId = detailTask?.id ?? tasks[0]?.id ?? null;

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {/* Hero header */}
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
            {overdueOnly ? "显示全部" : "仅逾期"}
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

      {/* Alert banners */}
      {overdueCount > 0 && (
        <Alert
          type="error"
          showIcon
          icon={<ExclamationCircleOutlined />}
          style={{ borderRadius: 8 }}
          message={
            <>
              <Text strong>{overdueCount}</Text> 个任务已逾期，请尽快处理，避免影响税务申报与资料归档。
            </>
          }
          action={
            <Button size="small" danger ghost
              icon={<BellOutlined />}
              onClick={() => { setOverdueOnly(true); void loadTasks(true); }}
            >
              查看逾期
            </Button>
          }
        />
      )}
      {notStartedCount > 0 && !overdueOnly && (
        <Alert
          type="info"
          showIcon
          style={{ borderRadius: 8 }}
          message={
            <>
              AI 已为您生成 <Text strong>{notStartedCount}</Text> 个待处理任务。拖拽卡片或点击「开始执行」推进任务。
            </>
          }
        />
      )}
      {navEventId && (
        <Alert
          type="info"
          showIcon
          style={{ borderRadius: 8 }}
          message={<>当前仅显示事项 <Text code>{navEventId}</Text> 的关联任务。</>}
        />
      )}

      <WorkflowRuntimeCard
        title="任务运行态 / 授权态"
        resourceType="task"
        resourceId={runtimeTaskId}
        emptyHint="选择一个任务后，可查看其执行状态、授权状态、重试与补偿信息。"
        onChanged={() => handleRuntimeChanged()}
        onDetailChange={setRuntimeDetail}
      />

      {/* Main content */}
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

      {/* Detail drawer */}
      <TaskDrawer
        task={detailTask}
        runtimeDetail={runtimeDetail}
        updatingId={updatingId}
        remindingId={remindingId}
        onClose={() => setDetailTask(null)}
        onStatusChange={handleStatusChange}
        onRemind={handleRemind}
        onOpenEvent={(businessEventId) => navigate("/events", { state: { businessEventId } })}
        onOpenDocuments={(businessEventId) => navigate("/documents", { state: { businessEventId } })}
        onOpenTax={(businessEventId) => navigate("/tax", { state: { businessEventId } })}
        onOpenVouchers={(businessEventId) => navigate("/vouchers", { state: { businessEventId } })}
      />

      {/* Help drawer */}
      <TaskDrawer
        task={null}
        runtimeDetail={null}
        updatingId={null}
        remindingId={null}
        onClose={() => setHelpOpen(false)}
        onStatusChange={handleStatusChange}
        onRemind={handleRemind}
      />
      {helpOpen && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={() => setHelpOpen(false)}
        >
          <div
            style={{
              background: "#fff", borderRadius: 16, padding: "28px 32px",
              maxWidth: 480, width: "90%", boxShadow: "0 8px 40px rgba(0,0,0,0.2)",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <Title level={5} style={{ margin: 0 }}>任务中心 · 说明</Title>
              <Button type="text" onClick={() => setHelpOpen(false)}>✕</Button>
            </div>
            <Space direction="vertical" size={12} style={{ width: "100%" }}>
              <Alert type="info" showIcon
                message="三个中心的关系"
                description="任务中心是执行入口；单据中心负责补齐发票、回单；凭证中心负责最终入账。任务中心在三者中最靠前。"
              />
              <Alert type="info" showIcon
                message="看板拖拽说明"
                description="拖拽卡片到目标列即可更新任务状态。已完成的任务无法继续拖拽到其他列。"
              />
              <Alert type="warning" showIcon
                message="逾期任务以红色高亮显示。若任务长期阻塞，应先定位是资料没补齐还是凭证无法推进，再回到对应页面处理。"
              />
            </Space>
          </div>
        </div>
      )}
    </div>
  );
}
