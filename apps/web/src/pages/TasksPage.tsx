import { useEffect, useState } from "react";
import type { Task, TaskTreeNode } from "@finance-taxation/domain-model";
import { listTasks, login } from "../lib/api";

function panelStyle() {
  return {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)",
    padding: "24px"
  } as const;
}

export function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskTree, setTaskTree] = useState<TaskTreeNode[]>([]);
  const [message, setMessage] = useState("正在准备任务数据。");

  function renderTree(nodes: TaskTreeNode[]) {
    return (
      <ul style={{ paddingLeft: "22px", lineHeight: 1.8 }}>
        {nodes.map((node) => (
          <li key={node.id}>
            {node.title} | {node.status} | {node.priority}
            {node.children.length ? renderTree(node.children) : null}
          </li>
        ))}
      </ul>
    );
  }

  useEffect(() => {
    async function bootstrap() {
      try {
        await login("chairman", "123456");
        const payload = await listTasks();
        setTasks(payload.items);
        setTaskTree(payload.tree);
        setMessage(`当前已加载 ${payload.total} 个任务。`);
      } catch (error) {
        setMessage((error as Error).message);
      }
    }
    void bootstrap();
  }, []);

  return (
    <section style={{ display: "grid", gap: "20px" }}>
      <article style={panelStyle()}>
        <h2 style={{ marginTop: 0 }}>任务中心</h2>
        <p style={{ lineHeight: 1.8 }}>{message}</p>
      </article>
      <article style={panelStyle()}>
        <h3 style={{ marginTop: 0 }}>当前任务</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">标题</th>
              <th align="left">状态</th>
              <th align="left">优先级</th>
              <th align="left">部门</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id} style={{ borderTop: "1px solid rgba(20,40,60,0.08)" }}>
                <td style={{ padding: "10px 0" }}>{task.title}</td>
                <td>{task.status}</td>
                <td>{task.priority}</td>
                <td>{task.assigneeDepartment || "-"}</td>
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
