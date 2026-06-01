import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Tag, Flex, Typography } from "antd";
import { ClockCircleOutlined } from "@ant-design/icons";

const { Text } = Typography;

const PRIORITY_CONFIG: Record<string, { color: string; label: string }> = {
  high:   { color: "red",     label: "高" },
  medium: { color: "orange",  label: "中" },
  low:    { color: "default", label: "低" },
};

export interface TaskCardItem {
  id: string;
  title: string;
  priority: string;
  status: string;
  dueAt?: string | null;
  isOverdue?: boolean;
}

interface TaskCardProps {
  task: TaskCardItem;
  onClick: () => void;
}

export function TaskCard({ task, onClick }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
    data: { status: task.status },
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    background: "#fff",
    borderRadius: 8,
    padding: "10px 12px",
    border: task.isOverdue ? "1px solid #fca5a5" : "1px solid #e2e8f0",
    cursor: "grab",
    transition: "box-shadow 0.15s",
    touchAction: "none",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onClick}
      aria-label={`任务：${task.title}`}
    >
      {task.isOverdue && (
        <Tag color="error" style={{ marginBottom: 6, fontSize: 11 }}>逾期</Tag>
      )}
      <div style={{ fontSize: 13, fontWeight: 500, color: "#0f172a", lineHeight: 1.4, marginBottom: 6 }}>
        {task.title}
      </div>
      <Flex gap={6} wrap="wrap">
        <Tag
          color={PRIORITY_CONFIG[task.priority]?.color ?? "default"}
          style={{ fontSize: 11, lineHeight: "18px", padding: "0 6px" }}
        >
          {PRIORITY_CONFIG[task.priority]?.label ?? task.priority}
        </Tag>
        {task.dueAt && (
          <Text type={task.isOverdue ? "danger" : "secondary"} style={{ fontSize: 11 }}>
            <ClockCircleOutlined style={{ marginRight: 3 }} />
            {task.dueAt.slice(0, 10)}
          </Text>
        )}
      </Flex>
    </div>
  );
}
