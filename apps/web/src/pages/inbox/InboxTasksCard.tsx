/**
 * 收件箱 · 待办任务卡片
 * 逾期任务优先展示，点击直达 /tasks。
 */
import { Button, Empty, Space, Spin, Tag, Typography } from "antd";
import { RightOutlined, CheckCircleOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { formatDueLabel, sortInboxTasks, taskPriorityShortLabel, type TaskWithOverdue } from "./inbox-helpers";

const { Text } = Typography;

const MAX_VISIBLE = 6;

interface InboxTasksCardProps {
  tasks: TaskWithOverdue[];
  loading: boolean;
}

export function InboxTasksCard({ tasks, loading }: InboxTasksCardProps) {
  const navigate = useNavigate();
  const sorted = sortInboxTasks(tasks);
  const overdueCount = sorted.filter((task) => task.isOverdue).length;

  return (
    <section className="v3-section-shell" data-testid="inbox-tasks-card">
      <Space style={{ justifyContent: "space-between", width: "100%" }}>
        <Space size={8}>
          <Text strong>✅ 待办任务</Text>
          {overdueCount > 0 && <Tag color="error">{overdueCount} 项逾期</Tag>}
          {sorted.length > 0 && <Tag>{sorted.length} 项待处理</Tag>}
        </Space>
        <Button type="link" size="small" onClick={() => navigate("/tasks")}>
          查看全部任务 <RightOutlined />
        </Button>
      </Space>

      {loading ? (
        <div style={{ padding: "24px 0", textAlign: "center" }}><Spin /></div>
      ) : sorted.length === 0 ? (
        <Empty
          style={{ margin: "16px 0" }}
          image={<CheckCircleOutlined style={{ fontSize: 32, color: "#16a34a" }} />}
          description={
            <Space direction="vertical" size={2}>
              <Text>当前没有待处理任务</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                下一步建议：前往任务中心创建新任务，或回到经营事项页确认待分析事项。
              </Text>
            </Space>
          }
        />
      ) : (
        <Space direction="vertical" size={8} style={{ width: "100%", marginTop: 10 }}>
          {sorted.slice(0, MAX_VISIBLE).map((task) => (
            <div
              key={task.id}
              onClick={() => navigate("/tasks")}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                borderRadius: 8, border: "1px solid rgba(20,40,60,0.08)",
                borderLeft: `3px solid ${task.isOverdue ? "#dc2626" : "#2563eb"}`,
                cursor: "pointer",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text strong style={{ fontSize: 13 }}>{task.title}</Text>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>{formatDueLabel(task.dueAt)}</div>
              </div>
              {task.isOverdue && <Tag color="error">逾期</Tag>}
              <Tag color={task.priority === "critical" || task.priority === "high" ? "orange" : "default"}>
                {taskPriorityShortLabel(task.priority)}
              </Tag>
              <RightOutlined style={{ color: "#94a3b8", fontSize: 11 }} />
            </div>
          ))}
          {sorted.length > MAX_VISIBLE && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              还有 {sorted.length - MAX_VISIBLE} 项，前往任务中心查看全部。
            </Text>
          )}
        </Space>
      )}
    </section>
  );
}
