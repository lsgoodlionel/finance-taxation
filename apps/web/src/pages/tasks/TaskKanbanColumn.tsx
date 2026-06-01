import { useDroppable } from "@dnd-kit/core";
import { Badge, Typography } from "antd";
import { TaskCard, type TaskCardItem } from "./TaskCard";

const { Text } = Typography;

interface TaskKanbanColumnProps {
  id: string;
  title: string;
  color: string;
  tasks: TaskCardItem[];
  onSelect: (task: TaskCardItem) => void;
}

export function TaskKanbanColumn({ id, title, color, tasks, onSelect }: TaskKanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      style={{
        flex: 1,
        minWidth: 210,
        background: isOver ? "#f0f9ff" : "#f8fafc",
        borderRadius: 12,
        border: isOver ? "1px solid #7dd3fc" : "1px solid #e2e8f0",
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      {/* Column header */}
      <div style={{
        padding: "12px 14px 10px",
        borderBottom: "1px solid #e2e8f0",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
        <Text strong style={{ fontSize: 13 }}>{title}</Text>
        <Badge
          count={tasks.length}
          style={{ background: "#e2e8f0", color: "#475569", boxShadow: "none" }}
        />
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        style={{
          padding: 10,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          minHeight: 80,
          maxHeight: 520,
          overflowY: "auto",
        }}
      >
        {tasks.length === 0 ? (
          <Text
            type="secondary"
            style={{ fontSize: 12, textAlign: "center", padding: "16px 0", display: "block" }}
          >
            暂无任务
          </Text>
        ) : (
          tasks.map(task => (
            <TaskCard key={task.id} task={task} onClick={() => onSelect(task)} />
          ))
        )}
      </div>
    </div>
  );
}
