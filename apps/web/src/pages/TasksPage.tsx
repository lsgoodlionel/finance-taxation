import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import type { Task, TaskStatus, TaskTreeNode } from "@finance-taxation/domain-model";
import { listTasks, remindTask, updateTaskStatus } from "../lib/api";
import { useI18n, TASK_STATUS_LABELS, TASK_PRIORITY_SHORT } from "../lib/i18n";
import { buildResultPageSubtitle } from "../lib/entry-guidance";
import { normalizeDrilldownState } from "./drilldown";

function TasksHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: "16px", padding: "28px 32px", maxWidth: "560px", width: "92%", boxShadow: "0 8px 40px rgba(0,0,0,0.2)", maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>任务中心 · 业务关系与操作说明</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "#9aa5b4" }}>✕</button>
        </div>
        <div style={{ display: "grid", gap: "14px", fontSize: "13.5px", lineHeight: 1.75 }}>
          <div style={{ background: "rgba(79,142,247,0.06)", borderRadius: "10px", padding: "14px 16px", border: "1px solid rgba(79,142,247,0.18)" }}>
            <strong>三个中心的关系</strong><br />
            <strong>任务中心</strong>是执行入口，负责把经营事项拆成可落地动作；<strong>单据中心</strong>负责补齐发票、回单、审批和附件；<strong>凭证中心</strong>负责最终入账。任务中心在三者中最靠前，决定后面该补哪些资料、由谁做、先做什么。
          </div>
          <div><strong>标准业务流程</strong>
            <ol style={{ margin: "6px 0 0 18px", padding: 0 }}>
              <li>AI 财税秘书或事项页分析业务后自动生成任务</li>
              <li>任务中心分配责任部门和执行顺序</li>
              <li>执行人根据任务要求前往单据中心补资料</li>
              <li>资料齐全后前往凭证中心完成审核和过账</li>
              <li>如有税务或归档要求，再进入税务、报表和归档流程</li>
            </ol>
          </div>
          <div><strong>本页负责什么</strong>
            <div>这里不直接做会计入账，而是负责推进执行。任务做得好，后面的单据和凭证才能顺畅；任务卡住，通常意味着资料、审批或责任分工有问题。</div>
          </div>
          <div><strong>任务状态说明</strong>
            <div style={{ display: "grid", gap: "4px", marginTop: "6px" }}>
              {[["待开始/待处理", "尚未开始执行的新任务"], ["进行中", "已开始、尚未完成"], ["已完成", "任务已执行完毕"], ["已阻塞", "因缺少信息或条件而暂停"], ["已取消", "已确认不需执行"]].map(([s, d]) => (
                <div key={s} style={{ display: "flex", gap: "8px" }}>
                  <span style={{ fontWeight: 600, minWidth: "80px" }}>{s}</span>
                  <span style={{ color: "#4d5d6c" }}>{d}</span>
                </div>
              ))}
            </div>
          </div>
          <div><strong>优先级说明</strong>
            <div style={{ display: "grid", gap: "4px", marginTop: "6px" }}>
              {[["高", "#dc2626", "必须本期完成，影响申报或合规"], ["中", "#d97706", "本月内完成"], ["低", "#6c7a89", "可延后处理"]].map(([p, c, d]) => (
                <div key={p} style={{ display: "flex", gap: "8px" }}>
                  <span style={{ color: c, fontWeight: 700, minWidth: "24px" }}>{p}</span>
                  <span style={{ color: "#4d5d6c" }}>{d}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: "rgba(255,165,0,0.08)", borderRadius: "8px", padding: "10px 14px", fontSize: "12.5px", color: "#b45309" }}>
            ⚠️ 逾期任务（截止日已过但未完成）会以红色高亮显示。若任务长期阻塞，应先定位是“资料没补齐”还是“凭证无法推进”，再回到对应页面处理。
          </div>
        </div>
      </div>
    </div>
  );
}

type TaskWithOverdue = Task & { isOverdue?: boolean };

const STATUS_BADGE: Record<string, string> = {
  not_started: "badge badge-gray",
  in_progress: "badge badge-blue",
  in_review: "badge badge-yellow",
  done: "badge badge-green",
  blocked: "badge badge-red",
  cancelled: "badge badge-gray",
  pending: "badge badge-gray",
  completed: "badge badge-green"
};

const PRIORITY_BADGE: Record<string, string> = {
  high: "badge badge-red",
  medium: "badge badge-yellow",
  low: "badge badge-gray"
};

// Next status transition for action buttons
const NEXT_STATUS: Partial<Record<TaskStatus, { status: TaskStatus; label: string; className: string }>> = {
  not_started: { status: "in_progress", label: "开始执行", className: "btn btn-primary btn-xs" },
  in_progress: { status: "done", label: "标记完成", className: "btn btn-success btn-xs" },
  in_review: { status: "done", label: "复核完成", className: "btn btn-success btn-xs" },
  blocked: { status: "in_progress", label: "解除阻塞", className: "btn btn-outline btn-xs" }
};

function RenderTree({ nodes }: { nodes: TaskTreeNode[] }) {
  const { t } = useI18n();
  return (
    <ul style={{ paddingLeft: 20, lineHeight: 1.9, fontSize: 13.5 }}>
      {nodes.map((node) => {
        const overdue = (node as TaskWithOverdue).isOverdue;
        return (
          <li key={node.id} style={{ color: overdue ? "var(--c-danger)" : "inherit" }}>
            {overdue && <span className="badge badge-red" style={{ marginRight: 6 }}>逾期</span>}
            {node.title}
            <span className="text-muted">
              {" · "}{t(TASK_STATUS_LABELS, node.status)}
              {" · "}{t(TASK_PRIORITY_SHORT, node.priority)}
            </span>
            {node.children.length ? <RenderTree nodes={node.children} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

export function TasksPage() {
  const location = useLocation();
  const navEventId = normalizeDrilldownState(location.state).businessEventId ?? null;
  const [tasks, setTasks] = useState<TaskWithOverdue[]>([]);
  const [taskTree, setTaskTree] = useState<TaskTreeNode[]>([]);
  const [message, setMessage] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadTasks(onlyOverdue: boolean) {
    setLoading(true);
    try {
      const payload = await listTasks(navEventId || undefined, onlyOverdue);
      setTasks(payload.items);
      setTaskTree(payload.tree);
      const overdueCount = payload.items.filter((t) => t.isOverdue).length;
      setMessage(
        `${navEventId ? `当前事项 ${navEventId}：` : ""}共 ${payload.total} 个任务${overdueCount > 0 ? `，${overdueCount} 个逾期` : ""}`
      );
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadTasks(false); }, [navEventId]);

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

  async function handleStatusChange(taskId: string, newStatus: TaskStatus) {
    setUpdatingId(taskId);
    try {
      await updateTaskStatus(taskId, newStatus);
      setTasks((prev) =>
        prev.map((t) => t.id === taskId ? { ...t, status: newStatus } : t)
      );
      const label = TASK_STATUS_LABELS[newStatus] ?? newStatus;
      setMessage(`任务已更新为「${label}」`);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleFilterToggle() {
    const next = !overdueOnly;
    setOverdueOnly(next);
    await loadTasks(next);
  }

  const { t } = useI18n();
  const overdueCount = tasks.filter((t) => t.isOverdue).length;
  const notStartedCount = tasks.filter((t) => t.status === "not_started").length;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {showHelp && <TasksHelpModal onClose={() => setShowHelp(false)} />}
      <div className="page-header">
        <div>
          <div className="page-title">任务中心</div>
          <div className="page-subtitle">{buildResultPageSubtitle("任务中心")}</div>
        </div>
        <div className="flex-row">
          {notStartedCount > 0 && (
            <span className="badge badge-yellow">📋 {notStartedCount} 待开始</span>
          )}
          {overdueCount > 0 && (
            <span className="badge badge-red">⚠ {overdueCount} 逾期</span>
          )}
          <button
            className={overdueOnly ? "btn btn-danger btn-sm" : "btn btn-outline btn-sm"}
            onClick={() => void handleFilterToggle()}
          >
            {overdueOnly ? "显示全部" : "仅逾期"}
          </button>
          <button onClick={() => setShowHelp(true)} title="操作说明" style={{ width: "26px", height: "26px", borderRadius: "50%", border: "1.5px solid rgba(79,142,247,0.6)", background: "rgba(79,142,247,0.08)", color: "#4f8ef7", fontWeight: 700, fontSize: "13px", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>?</button>
        </div>
      </div>

      {message && (
        <div className="alert alert-info">{message}</div>
      )}

      {notStartedCount > 0 && !overdueOnly && (
        <div style={{
          background: "rgba(79,142,247,0.08)",
          border: "1px solid rgba(79,142,247,0.3)",
          borderRadius: 8,
          padding: "12px 16px",
          fontSize: 13.5,
          color: "#2563eb"
        }}>
          <strong>💡 操作提示：</strong>AI 已自动为您生成 <strong>{notStartedCount}</strong> 个待处理任务。
          点击「开始执行」按钮可将任务推进为进行中，处理完成后点击「标记完成」结束任务。
        </div>
      )}

      {navEventId && (
        <div style={{
          background: "rgba(37,99,235,0.08)",
          border: "1px solid rgba(37,99,235,0.2)",
          borderRadius: 8,
          padding: "10px 14px",
          fontSize: 13,
          color: "#2563eb"
        }}>
          当前仅显示事项 <strong>{navEventId}</strong> 的关联任务。
        </div>
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
                {tasks.map((task) => {
                  const next = NEXT_STATUS[task.status];
                  return (
                    <tr key={task.id} style={{ background: task.isOverdue ? "rgba(220,38,38,0.04)" : undefined }}>
                      <td>
                        {task.isOverdue && (
                          <span className="badge badge-red" style={{ marginRight: 6 }}>逾期</span>
                        )}
                        {task.title}
                        {task.description && (
                          <div style={{ fontSize: 12, color: "#9aa5b4", marginTop: 2 }}>{task.description}</div>
                        )}
                      </td>
                      <td>
                        <span className={STATUS_BADGE[task.status] ?? "badge badge-gray"}>
                          {t(TASK_STATUS_LABELS, task.status)}
                        </span>
                      </td>
                      <td>
                        <span className={PRIORITY_BADGE[task.priority] ?? "badge badge-gray"}>
                          {t(TASK_PRIORITY_SHORT, task.priority)}
                        </span>
                      </td>
                      <td>{task.assigneeDepartment || "—"}</td>
                      <td style={{ color: task.isOverdue ? "var(--c-danger)" : undefined }}>
                        {task.dueAt ? task.dueAt.slice(0, 10) : "—"}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {next && task.status !== "done" && task.status !== "cancelled" && (
                            <button
                              className={next.className}
                              onClick={() => void handleStatusChange(task.id, next.status)}
                              disabled={updatingId === task.id}
                            >
                              {updatingId === task.id ? "更新中…" : next.label}
                            </button>
                          )}
                          {task.isOverdue && (
                            <button
                              className="btn btn-danger btn-xs"
                              onClick={() => void handleRemind(task.id)}
                              disabled={remindingId === task.id}
                            >
                              {remindingId === task.id ? "发送中…" : "催办"}
                            </button>
                          )}
                          {task.status === "in_progress" && (
                            <button
                              className="btn btn-outline btn-xs"
                              onClick={() => void handleStatusChange(task.id, "blocked")}
                              disabled={updatingId === task.id}
                            >
                              标记阻塞
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">任务树视图</span>
          <span style={{ fontSize: 12, color: "#9aa5b4" }}>按经营事项分组展示层级关系</span>
        </div>
        <div className="card-body">
          {taskTree.length ? <RenderTree nodes={taskTree} /> : <p className="text-muted">暂无任务树数据</p>}
        </div>
      </div>
    </div>
  );
}
