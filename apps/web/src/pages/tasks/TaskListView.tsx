import { Table, Tag, Button, Space, Empty, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  ClockCircleOutlined, CheckCircleOutlined, ExclamationCircleOutlined,
  StopOutlined, MinusCircleOutlined, BellOutlined,
} from "@ant-design/icons";
import type { TaskStatus } from "@finance-taxation/domain-model";
import type { TaskCardItem } from "./TaskCard";

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
  high:   { color: "red",    label: "高" },
  medium: { color: "orange", label: "中" },
  low:    { color: "default", label: "低" },
};

const NEXT_STATUS: Partial<Record<TaskStatus, { status: TaskStatus; label: string }>> = {
  not_started: { status: "in_progress", label: "开始执行" },
  in_progress: { status: "done",        label: "标记完成" },
  in_review:   { status: "done",        label: "复核完成" },
  blocked:     { status: "in_progress", label: "解除阻塞" },
};

export interface TaskListItem extends TaskCardItem {
  description?: string | null;
  assigneeDepartment?: string | null;
}

interface TaskListViewProps {
  tasks: TaskListItem[];
  updatingId: string | null;
  remindingId: string | null;
  onStatusChange: (taskId: string, status: TaskStatus) => Promise<void>;
  onRemind: (taskId: string) => Promise<void>;
  onSelect: (task: TaskListItem) => void;
}

export function TaskListView({ tasks, updatingId, remindingId, onStatusChange, onRemind, onSelect }: TaskListViewProps) {
  const columns: ColumnsType<TaskListItem> = [
    {
      title: "任务标题",
      dataIndex: "title",
      key: "title",
      render: (title: string, record) => (
        <div>
          {record.isOverdue && <Tag color="error" style={{ marginRight: 6, fontSize: 11 }}>逾期</Tag>}
          <Text strong style={{ fontSize: 13 }}>{title}</Text>
          {record.description && (
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{record.description}</div>
          )}
        </div>
      ),
    },
    {
      title: "状态", dataIndex: "status", key: "status", width: 100,
      filters: Object.entries(STATUS_CONFIG).map(([v, c]) => ({ text: c.label, value: v })),
      onFilter: (value, record) => record.status === value,
      render: (status: string) => {
        const cfg = STATUS_CONFIG[status];
        return cfg
          ? <Tag color={cfg.color} icon={cfg.icon} style={{ fontSize: 12 }}>{cfg.label}</Tag>
          : <Tag>{status}</Tag>;
      },
    },
    {
      title: "优先级", dataIndex: "priority", key: "priority", width: 80,
      filters: [
        { text: "高", value: "high" },
        { text: "中", value: "medium" },
        { text: "低", value: "low" },
      ],
      onFilter: (value, record) => record.priority === value,
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
      sorter: (a, b) => (a.dueAt ?? "").localeCompare(b.dueAt ?? ""),
      render: (v: string, record) =>
        v
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
              <Button type="primary" size="small" loading={isUpdating}
                onClick={() => void onStatusChange(record.id, next.status)}>
                {next.label}
              </Button>
            )}
            {record.status === "in_progress" && (
              <Button size="small" danger ghost loading={isUpdating}
                onClick={() => void onStatusChange(record.id, "blocked")}>
                标记阻塞
              </Button>
            )}
            {record.isOverdue && (
              <Button size="small" icon={<BellOutlined />}
                loading={remindingId === record.id}
                onClick={() => void onRemind(record.id)}>
                催办
              </Button>
            )}
            <Button size="small" type="text" onClick={() => onSelect(record)}>详情</Button>
          </Space>
        );
      },
    },
  ];

  return (
    <Table
      dataSource={tasks}
      columns={columns}
      rowKey="id"
      size="middle"
      pagination={{ pageSize: 20, showTotal: total => `共 ${total} 条`, size: "small", hideOnSinglePage: true }}
      locale={{ emptyText: <Empty description="暂无任务数据" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
      onRow={record => ({
        style: record.isOverdue ? { background: "rgba(220,38,38,0.03)" } : undefined,
      })}
    />
  );
}
