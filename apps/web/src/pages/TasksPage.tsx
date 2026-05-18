import { useEffect, useState } from "react";
import type { Task, TaskTreeNode } from "@finance-taxation/domain-model";
import { listTasks, remindTask } from "../lib/api";

type TaskWithOverdue = Task & { isOverdue?: boolean };

const STATUS_BADGE: Record<string, string> = {
  pending: "badge badge-gray",
  in_progress: "badge badge-blue",
  completed: "badge badge-green",
  blocked: "badge badge-red",
  cancelled: "badge badge-gray"
};

const PRIORITY_BADGE: Record<string, string> = {
  high: "badge badge-red",
  medium: "badge badge-yellow",
  low: "badge badge-gray"
};

function renderTree(nodes: TaskTreeNode[]) {
  return (
    <ul style={{ paddingLeft: 20, lineHeight: 1.9, fontSize: 13.5 }}>
      {nodes.map((node) => {
        const overdue = (node as TaskWithOverdue).isOverdue;
        return (
          <li key={node.id} style={{ color: overdue ? "var(--c-danger)" : "inherit" }}>
            {overdue && <span className="badge badge-red" style={{ marginRight: 6 }}>逾期</span>}
            {node.title}
            <span className="text-muted"> · {node.status} · {node.priority}</span>
            {node.children.length ? renderTree(node.children) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function TasksPage() {
  const [tasks, setTasks] = useState<TaskWithOverdue[]>([]);
  const [taskTree, setTaskTree] = useState<TaskTreeNode[]>([]);
  const [message, setMessage] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadTasks(onlyOverdue: boolean) {
    setLoading(true);
    try {
      const payload = await listTasks(undefined, onlyOverdue);
      setTasks(payload.items);
      setTaskTree(payload.tree);
      const overdueCount = payload.items.filter((t) => t.isOverdue).length;
      setMessage(
        `共 ${payload.total} 个任务${overdueCount > 0 ? `，${overdueCount} 个逾期` : ""}`
      );
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadTasks(false); }, []);

  async function handleRemind(taskId: string) {
    setRemindingId(taskId);
    try {
      await remindTask(taskId);
      setMessage("催办通知已发送");
    } catch (err) {
      setMessage((err as Error).message);
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
    <div style={{ display: "grid", gap: 20 }}>
      <div className="page-header">
        <div>
          <div className="page-title">任务中心</div>
          <div className="page-subtitle">查看与管理所有任务，跟踪逾期状态</div>
        </div>
        <div className="flex-row">
          {overdueCount > 0 && (
            <span className="badge badge-red">⚠ {overdueCount} 逾期</span>
          )}
          <button
            className={overdueOnly ? "btn btn-danger btn-sm" : "btn btn-outline btn-sm"}
            onClick={() => void handleFilterToggle()}
          >
            {overdueOnly ? "显示全部" : "仅逾期"}
          </button>
        </div>
      </div>

      {message && (
        <div className="alert alert-info">{message}</div>
      )}

      <div className="card">
        <div className="card-header">
          <span className="card-title">任务列表</span>
          <span className="badge badge-gray">{tasks.length}</span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="state-loading">加载中…</div>
          ) : tasks.length === 0 ? (
            <div className="state-empty">暂无任务数据</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>标题</th>
                  <th>状态</th>
                  <th>优先级</th>
                  <th>部门</th>
                  <th>截止时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id} style={{ background: task.isOverdue ? "rgba(220,38,38,0.04)" : undefined }}>
                    <td>
                      {task.isOverdue && (
                        <span className="badge badge-red" style={{ marginRight: 6 }}>逾期</span>
                      )}
                      {task.title}
                    </td>
                    <td>
                      <span className={STATUS_BADGE[task.status] ?? "badge badge-gray"}>
                        {task.status}
                      </span>
                    </td>
                    <td>
                      <span className={PRIORITY_BADGE[task.priority] ?? "badge badge-gray"}>
                        {task.priority}
                      </span>
                    </td>
                    <td>{task.assigneeDepartment || "—"}</td>
                    <td style={{ color: task.isOverdue ? "var(--c-danger)" : undefined }}>
                      {task.dueAt ? task.dueAt.slice(0, 10) : "—"}
                    </td>
                    <td>
                      {task.isOverdue && (
                        <button
                          className="btn btn-danger btn-xs"
                          onClick={() => void handleRemind(task.id)}
                          disabled={remindingId === task.id}
                        >
                          {remindingId === task.id ? "发送中…" : "催办"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">任务树视图</span>
        </div>
        <div className="card-body">
          {taskTree.length ? renderTree(taskTree) : <p className="text-muted">暂无任务树数据</p>}
        </div>
      </div>
    </div>
  );
}
