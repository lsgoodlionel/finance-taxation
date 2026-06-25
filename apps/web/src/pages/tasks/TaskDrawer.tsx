import { Drawer, Space, Button, Tag, Alert, Typography } from "antd";
import {
  ClockCircleOutlined, CheckCircleOutlined, ExclamationCircleOutlined,
  StopOutlined, MinusCircleOutlined, BellOutlined,
} from "@ant-design/icons";
import type { TaskStatus } from "@finance-taxation/domain-model";
import type { WorkflowRunDetail } from "../../lib/api";

const { Text } = Typography;

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

export interface TaskDrawerItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt?: string | null;
  isOverdue?: boolean;
  description?: string | null;
  assigneeDepartment?: string | null;
}

interface TaskDrawerProps {
  task: TaskDrawerItem | null;
  runtimeDetail?: WorkflowRunDetail | null;
  updatingId: string | null;
  remindingId: string | null;
  onClose: () => void;
  onStatusChange: (taskId: string, status: TaskStatus) => Promise<void>;
  onRemind: (taskId: string) => Promise<void>;
}

export function TaskDrawer({ task, runtimeDetail, updatingId, remindingId, onClose, onStatusChange, onRemind }: TaskDrawerProps) {
  const activeNext = task ? NEXT_STATUS[task.status as TaskStatus] : undefined;
  const latestCommand = runtimeDetail?.commands[0] ?? null;

  return (
    <Drawer
      title={task?.title ?? "任务详情"}
      open={!!task}
      onClose={onClose}
      width={440}
      aria-label="任务详情面板"
      footer={
        task && (
          <Space>
            {activeNext && task.status !== "done" && task.status !== "cancelled" && (
              <Button
                type="primary"
                loading={updatingId === task.id}
                onClick={() => void onStatusChange(task.id, activeNext.status)}
              >
                {activeNext.label}
              </Button>
            )}
            {task.status === "in_progress" && (
              <Button
                danger
                loading={updatingId === task.id}
                onClick={() => void onStatusChange(task.id, "blocked")}
              >
                标记阻塞
              </Button>
            )}
            {task.isOverdue && (
              <Button
                icon={<BellOutlined />}
                loading={remindingId === task.id}
                onClick={() => void onRemind(task.id)}
              >
                催办
              </Button>
            )}
          </Space>
        )
      }
    >
      {task && (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          {task.isOverdue && (
            <Alert type="error" showIcon message="该任务已逾期，请尽快处理" />
          )}
          {runtimeDetail?.run.blockedReason ? (
            <Alert type="error" showIcon message="运行阻塞" description={runtimeDetail.run.blockedReason} />
          ) : null}
          {latestCommand?.lastErrorDetail || runtimeDetail?.compensations.length ? (
            <Alert
              type="warning"
              showIcon
              message={latestCommand?.lastErrorCode || "运行提示"}
              description={`${latestCommand?.lastErrorDetail || "已存在人工补偿记录"}${runtimeDetail?.compensations.length ? `；补偿 ${runtimeDetail.compensations.length} 条` : ""}`}
            />
          ) : null}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px" }}>
            {[
              {
                label: "状态",
                content: (() => {
                  const cfg = STATUS_CONFIG[task.status];
                  return cfg
                    ? <Tag color={cfg.color} icon={cfg.icon}>{cfg.label}</Tag>
                    : <Tag>{task.status}</Tag>;
                })(),
              },
              {
                label: "优先级",
                content: (() => {
                  const cfg = PRIORITY_CONFIG[task.priority];
                  return cfg ? <Tag color={cfg.color}>{cfg.label}</Tag> : <Tag>{task.priority}</Tag>;
                })(),
              },
              {
                label: "责任部门",
                content: <Text>{task.assigneeDepartment || "—"}</Text>,
              },
              {
                label: "截止日期",
                content: (
                  <Text type={task.isOverdue ? "danger" : undefined}>
                    {task.dueAt ? task.dueAt.slice(0, 10) : "—"}
                  </Text>
                ),
              },
            ].map(({ label, content }) => (
              <div key={label}>
                <Text type="secondary" style={{ fontSize: 12 }}>{label}</Text>
                <div style={{ marginTop: 4 }}>{content}</div>
              </div>
            ))}
          </div>

          {task.description && (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>任务描述</Text>
              <div style={{
                marginTop: 6, padding: "10px 12px",
                background: "#f8fafc", borderRadius: 8,
                fontSize: 13, lineHeight: 1.7,
              }}>
                {task.description}
              </div>
            </div>
          )}
        </Space>
      )}
    </Drawer>
  );
}
