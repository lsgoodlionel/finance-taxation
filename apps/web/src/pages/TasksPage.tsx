import { useEffect, useState } from "react";
import type { Task, TaskTreeNode } from "@finance-taxation/domain-model";
import { listTasks, login, remindTask } from "../lib/api";

type TaskWithOverdue = Task & { isOverdue?: boolean };

function panelStyle() {
  return {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)",
    padding: "24px"
  } as const;
}

function cellStyle() {
  return {
    borderBottom: "1px solid rgba(20,40,60,0.08)",
    padding: "10px 8px",
    textAlign: "left" as const,
    verticalAlign: "top" as const
  };
}

const STATUS_COLORS: Record<string, string> = {
  pending: "#6c757d",
  in_progress: "#0d6efd",
  completed: "#198754",
  blocked: "#dc3545",
  cancelled: "#adb5bd"
};

export function TasksPage() {
  const [tasks, setTasks] = useState<TaskWithOverdue[]>([]);
  const [taskTree, setTaskTree] = useState<TaskTreeNode[]>([]);
  const [message, setMessage] = useState("正在准备任务数据。");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [remindingId, setRemindingId] = useState<string | null>(null);

  function renderTree(nodes: TaskTreeNode[]) {
    return (
      <ul style={{ paddingLeft: "22px", lineHeight: 1.8 }}>
        {nodes.map((node) => (
          <li key={node.id} style={{ color: (node as TaskWithOverdue).isOverdue ? "#dc3545" : "inherit" }}>
            {(node as TaskWithOverdue).isOverdue && (
              <span style={{ marginRight: "6px", fontWeight: 700 }}>⚠ 逾期</span>
            )}
            {node.title} | {node.status} | {node.priority}
            {node.children.length ? renderTree(node.children) : null}
          </li>
        ))}
      </ul>
    );
  }

  async function loadTasks(onlyOverdue: boolean) {
    try {
      await login("chairman", "123456");
      const payload = await listTasks(undefined, onlyOverdue);
      setTasks(payload.items);
      setTaskTree(payload.tree);
      const overdueCount = payload.items.filter((t) => t.isOverdue).length;
      setMessage(
        `当前已加载 ${payload.total} 个任务${overdueCount > 0 ? `，其中 ${overdueCount} 个已逾期` : ""}。`
      );
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  useEffect(() => {
    void loadTasks(overdueOnly);
  }, []);

  async function handleRemind(taskId: string) {
    setRemindingId(taskId);
    try {
      await remindTask(taskId);
      setMessage("催办通知已发送。");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setRemindingId(null);
    }
  }

  async function handleFilterToggle() {
    const next = !overdueOnly;
    setOverdueOnly(next);
    await loadTasks(next);
  }

  const overdueCount = tasks.filter((t) => t.isOverdue).length;

  return (
    <section style={{ display: "grid", gap: "20px" }}>
      <article style={panelStyle()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ marginTop: 0 }}>任务中心</h2>
            <p style={{ lineHeight: 1.8, color: "#4d5d6c", marginBottom: 0 }}>{message}</p>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            {overdueCount > 0 && (
              <span
                style={{
                  background: "#dc3545",
                  color: "#fff",
                  borderRadius: "12px",
                  padding: "2px 10px",
                  fontSize: "13px",
                  fontWeight: 700
                }}
              >
                ⚠ {overdueCount} 逾期
              </span>
            )}
            <button
              onClick={() => void handleFilterToggle()}
              style={{
                padding: "6px 14px",
                borderRadius: "12px",
                border: "1px solid rgba(20,40,60,0.15)",
                background: overdueOnly ? "#dc3545" : "transparent",
                color: overdueOnly ? "#fff" : "#1e2a37",
                cursor: "pointer"
              }}
            >
              {overdueOnly ? "显示全部" : "仅逾期"}
            </button>
          </div>
        </div>
      </article>

      <article style={panelStyle()}>
        <h3 style={{ marginTop: 0 }}>当前任务列表</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={cellStyle()}>标题</th>
              <th style={cellStyle()}>状态</th>
              <th style={cellStyle()}>优先级</th>
              <th style={cellStyle()}>部门</th>
              <th style={cellStyle()}>截止时间</th>
              <th style={cellStyle()}>操作</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr
                key={task.id}
                style={{
                  background: task.isOverdue ? "rgba(220,53,69,0.06)" : "transparent"
                }}
              >
                <td style={cellStyle()}>
                  {task.isOverdue && (
                    <span
                      style={{
                        display: "inline-block",
                        marginRight: "6px",
                        background: "#dc3545",
                        color: "#fff",
                        borderRadius: "6px",
                        padding: "1px 6px",
                        fontSize: "11px",
                        fontWeight: 700,
                        verticalAlign: "middle"
                      }}
                    >
                      逾期
                    </span>
                  )}
                  {task.title}
                </td>
                <td style={cellStyle()}>
                  <span style={{ color: STATUS_COLORS[task.status] ?? "#333" }}>{task.status}</span>
                </td>
                <td style={cellStyle()}>{task.priority}</td>
                <td style={cellStyle()}>{task.assigneeDepartment || "-"}</td>
                <td style={{ ...cellStyle(), color: task.isOverdue ? "#dc3545" : "inherit" }}>
                  {task.dueAt ? task.dueAt.slice(0, 10) : "-"}
                </td>
                <td style={cellStyle()}>
                  {task.isOverdue && (
                    <button
                      onClick={() => void handleRemind(task.id)}
                      disabled={remindingId === task.id}
                      style={{
                        fontSize: "12px",
                        padding: "3px 10px",
                        borderRadius: "6px",
                        border: "1px solid #dc3545",
                        background: "none",
                        color: "#dc3545",
                        cursor: "pointer"
                      }}
                    >
                      {remindingId === task.id ? "发送中..." : "催办"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>

      <article style={panelStyle()}>
        <h3 style={{ marginTop: 0 }}>任务树</h3>
        {taskTree.length ? renderTree(taskTree) : <p>当前还没有任务树数据。</p>}
      </article>
    </section>
  );
}
