import { useMemo } from "react";
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { TaskStatus } from "@finance-taxation/domain-model";
import { TaskKanbanColumn } from "./TaskKanbanColumn";
import type { TaskCardItem } from "./TaskCard";

const COLUMNS: { id: TaskStatus; title: string; color: string }[] = [
  { id: "not_started", title: "待开始", color: "#94a3b8" },
  { id: "in_progress", title: "进行中", color: "#3b82f6" },
  { id: "done",        title: "已完成", color: "#16a34a" },
  { id: "blocked",     title: "已阻塞", color: "#dc2626" },
];

// Map status values to the four kanban column IDs
function toColumnId(status: string): TaskStatus {
  if (status === "in_review") return "in_progress";
  if (status === "cancelled") return "done";
  return status as TaskStatus;
}

interface TaskKanbanViewProps {
  tasks: TaskCardItem[];
  onStatusChange: (taskId: string, newStatus: TaskStatus) => Promise<void>;
  onSelect: (task: TaskCardItem) => void;
}

export function TaskKanbanView({ tasks, onStatusChange, onSelect }: TaskKanbanViewProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const groups = useMemo(() => {
    const map: Record<string, TaskCardItem[]> = {
      not_started: [],
      in_progress: [],
      done: [],
      blocked: [],
    };
    for (const task of tasks) {
      const col = toColumnId(task.status);
      if (map[col]) map[col].push(task);
    }
    return map;
  }, [tasks]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;

    const taskId = active.id as string;
    const newStatus = over.id as TaskStatus;
    const currentStatus = (active.data.current as { status: string }).status;

    if (toColumnId(currentStatus) === newStatus) return;
    void onStatusChange(taskId, newStatus);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div
        style={{
          display: "flex",
          gap: 12,
          overflowX: "auto",
          padding: "4px 0",
        }}
        role="region"
        aria-label="任务看板"
      >
        {COLUMNS.map(col => (
          <TaskKanbanColumn
            key={col.id}
            id={col.id}
            title={col.title}
            color={col.color}
            tasks={groups[col.id] ?? []}
            onSelect={onSelect}
          />
        ))}
      </div>
    </DndContext>
  );
}
