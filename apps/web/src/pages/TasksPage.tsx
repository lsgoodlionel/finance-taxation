import { useEffect, useState, useMemo } from "react";
import { useLocation } from "react-router-dom";
import {
  Table, Tag, Button, Space, Alert, Drawer, Typography, Badge, Segmented,
  Tooltip, Empty, Skeleton, Flex, Card,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  ClockCircleOutlined, CheckCircleOutlined, ExclamationCircleOutlined,
  StopOutlined, MinusCircleOutlined, BellOutlined,
  QuestionCircleOutlined, AppstoreOutlined, UnorderedListOutlined,
} from "@ant-design/icons";
import { toast } from "sonner";
import type { Task, TaskStatus, TaskTreeNode } from "@finance-taxation/domain-model";
import { listTasks, remindTask, updateTaskStatus } from "../lib/api";
import { useI18n, TASK_STATUS_LABELS } from "../lib/i18n";
import { buildResultPageSubtitle } from "../lib/entry-guidance";
import { normalizeDrilldownState } from "./drilldown";

const { Text, Title } = Typography;
type TaskWithOverdue = Task & { isOverdue?: boolean };
type ViewMode = "list" | "kanban";

const STATUS_CONFIG: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  not_started: { color: "default",    icon: <MinusCircleOutlined />,       label: "待开始" },
  in_progress: { color: "processing", icon: <ClockCircleOutlined />,       label: "进行中" },
  in_review:   { color: "warning",    icon: <ExclamationCircleOutlined />, label: "复核中" },
  done:        { color: "success",    icon: <CheckCircleOutlined />,       label: "已完成" },
  blocked:     { color: "error",      icon: <StopOutlined />,              label: "已阻塞" },
  cancelled:   { color: "default",    icon: <StopOutlined />,              label: "已取消" },
};

const PRIORITY_CONFIG: Record<string, { color: string; label: string }> = {
  high:   { color: "red",     label: "高" },
  medium: { color: "orange",  label: "中" },
  low:    { color: "default", label: "低" },
};

const NEXT_STATUS: Partial<Record<TaskStatus, { status: TaskStatus; label: string }>> = {
  not_started: { status: "in_progress", label: "开始执行" },
  in_progress: { status: "done",        label: "标记完成" },
  in_review:   { status: "done",        label: "复核完成" },
  blocked:     { status: "in_progress", label: "解除阻塞" },
};

function KanbanCard({ task, onClick }: { task: TaskWithOverdue; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "#fff", borderRadius: 8, padding: "10px 12px",
        border: task.isOverdue ? "1px solid #fca5a5" : "1px solid #e2e8f0",
        cursor: "pointer", transition: "box-shadow 0.15s",
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.10)"; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}
    >
      {task.isOverdue && <Tag color="error" style={{ marginBottom: 6, fontSize: 11 }}>逾期</Tag>}
      <div style={{ fontSize: 13, fontWeight: 500, color: "#0f172a", lineHeight: 1.4, marginBottom: 6 }}>{task.title}</div>
      <Flex gap={6} wrap="wrap">
        <Tag color={PRIORITY_CONFIG[task.priority]?.color ?? "default"} style={{ fontSize: 11, lineHeight: "18px", padding: "0 6px" }}>
          {PRIORITY_CONFIG[task.priority]?.label ?? task.priority}
        </Tag>
        {task.dueAt && (
          <Text type={task.isOverdue ? "danger" : "secondary"} style={{ fontSize: 11 }}>
            <ClockCircleOutlined style={{ marginRight: 3 }} />{task.dueAt.slice(0, 10)}
          </Text>
        )}
      </Flex>
    </div>
  );
}

function KanbanColumn({ title, tasks, color, onSelect }: { title: string; tasks: TaskWithOverdue[]; color: string; onSelect: (t: TaskWithOverdue) => void }) {
  return (
    <div style={{ flex: 1, minWidth: 210, background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0" }}>
      <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
        <Text strong style={{ fontSize: 13 }}>{title}</Text>
        <Badge count={tasks.length} style={{ background: "#e2e8f0", color: "#475569", boxShadow: "none" }} />
      </div>
      <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: 8, maxHeight: 500, overflowY: "auto" }}>
        {tasks.length === 0
          ? <Text type="secondary" style={{ fontSize: 12, textAlign: "center", padding: "16px 0", display: "block" }}>暂无任务</Text>
          : tasks.map(t => <KanbanCard key={t.id} task={t} onClick={() => onSelect(t)} />)}
      </div>
    </div>
  );
}

export function TasksPage() {
  const location = useLocation();
  const navEventId = normalizeDrilldownState(location.state).businessEventId ?? null;
  const [tasks, setTasks] = useState<TaskWithOverdue[]>([]);
  const [taskTree, setTaskTree] = useState<TaskTreeNode[]>([]);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [helpOpen, setHelpOpen] = useState(false);
  const [detailTask, setDetailTask] = useState<TaskWithOverdue | null>(null);
  const { t } = useI18n();

  // suppress unused warning - tree kept for future use
  void taskTree;

  async function loadTasks(onlyOverdue: boolean) {
    setLoading(true);
    try {
      const payload = await listTasks(navEventId || undefined, onlyOverdue);
      setTasks(payload.items);
      setTaskTree(payload.tree);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadTasks(false); }, [navEventId]);

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

  async function handleStatusChange(taskId: string, newStatus: TaskStatus) {
    setUpdatingId(taskId);
    try {
      await updateTaskStatus(taskId, newStatus);
      setTasks(prev => prev.map(task => task.id === taskId ? { ...task, status: newStatus } : task));
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

  const overdueCount = useMemo(() => tasks.filter(task => task.isOverdue).length, [tasks]);
  const notStartedCount = useMemo(() => tasks.filter(task => task.status === "not_started").length, [tasks]);

  const kanbanGroups = useMemo(() => ({
    not_started: tasks.filter(task => task.status === "not_started"),
    in_progress: tasks.filter(task => task.status === "in_progress" || task.status === "in_review"),
    done:        tasks.filter(task => task.status === "done"),
    blocked:     tasks.filter(task => task.status === "blocked"),
  }), [tasks]);

  const columns: ColumnsType<TaskWithOverdue> = [
    {
      title: "任务标题",
      dataIndex: "title",
      key: "title",
      render: (title: string, record) => (
        <div>
          {record.isOverdue && <Tag color="error" style={{ marginRight: 6, fontSize: 11 }}>逾期</Tag>}
          <Text strong style={{ fontSize: 13 }}>{title}</Text>
          {record.description && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{record.description}</div>}
        </div>
      ),
    },
    {
      title: "状态", dataIndex: "status", key: "status", width: 100,
      render: (status: string) => {
        const cfg = STATUS_CONFIG[status];
        return cfg ? <Tag color={cfg.color} icon={cfg.icon} style={{ fontSize: 12 }}>{cfg.label}</Tag> : <Tag>{status}</Tag>;
      },
    },
    {
      title: "优先级", dataIndex: "priority", key: "priority", width: 80,
      render: (priority: string) => {
        const cfg = PRIORITY_CONFIG[priority];
        return cfg ? <Tag color={cfg.color}>{cfg.label}</Tag> : <Tag>{priority}</Tag>;
      },
    },
    {
      title: "部门", dataIndex: "assigneeDepartment", key: "dept", width: 110,
      render: (v: string) => v || <Text type="secondary">—</Text>,
    },
    {
      title: "截止日", dataIndex: "dueAt", key: "dueAt", width: 110,
      render: (v: string, record) => v
        ? <Text type={record.isOverdue ? "danger" : undefined} style={{ fontSize: 13 }}>{v.slice(0, 10)}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: "操作", key: "actions", width: 200,
      render: (_, record) => {
        const next = NEXT_STATUS[record.status as TaskStatus];
        const isUpdating = updatingId === record.id;
        return (
          <Space size={4} wrap>
            {next && record.status !== "done" && record.status !== "cancelled" && (
              <Button type="primary" size="small" loading={isUpdating} onClick={() => void handleStatusChange(record.id, next.status)}>
                {next.label}
              </Button>
            )}
            {record.status === "in_progress" && (
              <Button size="small" danger ghost loading={isUpdating} onClick={() => void handleStatusChange(record.id, "blocked")}>
                标记阻塞
              </Button>
            )}
            {record.isOverdue && (
              <Button size="small" icon={<BellOutlined />} loading={remindingId === record.id} onClick={() => void handleRemind(record.id)}>
                催办
              </Button>
            )}
            <Button size="small" type="text" onClick={() => setDetailTask(record)}>详情</Button>
          </Space>
        );
      },
    },
  ];

  const activeNext = detailTask ? NEXT_STATUS[detailTask.status as TaskStatus] : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <Title level={4} style={{ margin: 0, color: "#0f172a" }}>任务中心</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>{buildResultPageSubtitle("任务中心")}</Text>
        </div>
        <Space wrap>
          {notStartedCount > 0 && <Tag icon={<ClockCircleOutlined />} color="blue">{notStartedCount} 待开始</Tag>}
          {overdueCount > 0 && <Tag icon={<ExclamationCircleOutlined />} color="error">{overdueCount} 逾期</Tag>}
          <Button
            type={overdueOnly ? "primary" : "default"}
            danger={overdueOnly}
            size="small"
            onClick={() => { const next = !overdueOnly; setOverdueOnly(next); void loadTasks(next); }}
          >
            {overdueOnly ? "显示全部" : "仅逾期"}
          </Button>
          <Segmented
            size="small"
            value={viewMode}
            onChange={v => setViewMode(v as ViewMode)}
            options={[
              { value: "list",   icon: <UnorderedListOutlined /> },
              { value: "kanban", icon: <AppstoreOutlined /> },
            ]}
          />
          <Tooltip title="操作说明">
            <Button shape="circle" size="small" icon={<QuestionCircleOutlined />} onClick={() => setHelpOpen(true)} />
          </Tooltip>
        </Space>
      </div>

      {notStartedCount > 0 && !overdueOnly && (
        <Alert type="info" showIcon style={{ borderRadius: 8 }}
          message={<>AI 已为您生成 <Text strong>{notStartedCount}</Text> 个待处理任务。点击「开始执行」推进任务，完成后点击「标记完成」。</>}
        />
      )}

      {navEventId && (
        <Alert type="info" showIcon style={{ borderRadius: 8 }}
          message={<>当前仅显示事项 <Text code>{navEventId}</Text> 的关联任务。</>}
        />
      )}

      {/* Main card */}
      <Card
        title={<Space><Text strong>任务列表</Text><Tag>{tasks.length}</Tag></Space>}
        styles={{ body: { padding: 0 } }}
        style={{ borderRadius: 12 }}
      >
        {loading ? (
          <div style={{ padding: 24 }}><Skeleton active paragraph={{ rows: 6 }} /></div>
        ) : viewMode === "list" ? (
          <Table
            dataSource={tasks}
            columns={columns}
            rowKey="id"
            size="middle"
            pagination={{ pageSize: 20, showTotal: total => `共 ${total} 条`, size: "small", hideOnSinglePage: true }}
            locale={{ emptyText: <Empty description="暂无任务数据" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
            onRow={record => ({ style: record.isOverdue ? { background: "rgba(220,38,38,0.03)" } : undefined })}
          />
        ) : (
          <div style={{ padding: 16, display: "flex", gap: 12, overflowX: "auto" }}>
            <KanbanColumn title="待开始" tasks={kanbanGroups.not_started} color="#94a3b8" onSelect={setDetailTask} />
            <KanbanColumn title="进行中" tasks={kanbanGroups.in_progress} color="#3b82f6" onSelect={setDetailTask} />
            <KanbanColumn title="已完成" tasks={kanbanGroups.done}        color="#16a34a" onSelect={setDetailTask} />
            <KanbanColumn title="已阻塞" tasks={kanbanGroups.blocked}     color="#dc2626" onSelect={setDetailTask} />
          </div>
        )}
      </Card>

      {/* Task detail drawer */}
      <Drawer
        title={detailTask?.title ?? "任务详情"}
        open={!!detailTask}
        onClose={() => setDetailTask(null)}
        width={440}
        footer={
          detailTask && (
            <Space>
              {activeNext && detailTask.status !== "done" && detailTask.status !== "cancelled" && (
                <Button type="primary" loading={updatingId === detailTask.id} onClick={() => void handleStatusChange(detailTask.id, activeNext.status)}>
                  {activeNext.label}
                </Button>
              )}
              {detailTask.status === "in_progress" && (
                <Button danger loading={updatingId === detailTask.id} onClick={() => void handleStatusChange(detailTask.id, "blocked")}>
                  标记阻塞
                </Button>
              )}
              {detailTask.isOverdue && (
                <Button icon={<BellOutlined />} loading={remindingId === detailTask.id} onClick={() => void handleRemind(detailTask.id)}>
                  催办
                </Button>
              )}
            </Space>
          )
        }
      >
        {detailTask && (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            {detailTask.isOverdue && <Alert type="error" showIcon message="该任务已逾期，请尽快处理" />}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px" }}>
              {[
                { label: "状态", content: (() => { const cfg = STATUS_CONFIG[detailTask.status]; return cfg ? <Tag color={cfg.color} icon={cfg.icon}>{cfg.label}</Tag> : <Tag>{detailTask.status}</Tag>; })() },
                { label: "优先级", content: (() => { const cfg = PRIORITY_CONFIG[detailTask.priority]; return cfg ? <Tag color={cfg.color}>{cfg.label}</Tag> : <Tag>{detailTask.priority}</Tag>; })() },
                { label: "责任部门", content: <Text>{detailTask.assigneeDepartment || "—"}</Text> },
                { label: "截止日期", content: <Text type={detailTask.isOverdue ? "danger" : undefined}>{detailTask.dueAt ? detailTask.dueAt.slice(0, 10) : "—"}</Text> },
              ].map(({ label, content }) => (
                <div key={label}>
                  <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
                  <div style={{ marginTop: 4 }}>{content}</div>
                </div>
              ))}
            </div>
            {detailTask.description && (
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>任务描述</Text>
                <div style={{ marginTop: 6, padding: "10px 12px", background: "#f8fafc", borderRadius: 8, fontSize: 13, lineHeight: 1.7 }}>
                  {detailTask.description}
                </div>
              </div>
            )}
          </Space>
        )}
      </Drawer>

      {/* Help drawer */}
      <Drawer title="任务中心 · 说明" open={helpOpen} onClose={() => setHelpOpen(false)} width={480}>
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Alert type="info" showIcon message="三个中心的关系"
            description="任务中心是执行入口；单据中心负责补齐发票、回单；凭证中心负责最终入账。任务中心在三者中最靠前。"
          />
          <div>
            <Text strong>状态说明</Text>
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              {[["待开始/待处理","尚未开始执行的新任务"],["进行中","已开始、尚未完成"],["已完成","任务已执行完毕"],["已阻塞","因缺少信息或条件暂停"],["已取消","已确认不需执行"]].map(([s, d]) => (
                <div key={s} style={{ display: "flex", gap: 8, fontSize: 13 }}>
                  <Text strong style={{ minWidth: 90 }}>{s}</Text>
                  <Text type="secondary">{d}</Text>
                </div>
              ))}
            </div>
          </div>
          <Alert type="warning" showIcon message="逾期任务以红色高亮显示。若任务长期阻塞，应先定位是资料没补齐还是凭证无法推进，再回到对应页面处理。" />
        </Space>
      </Drawer>
    </div>
  );
}
