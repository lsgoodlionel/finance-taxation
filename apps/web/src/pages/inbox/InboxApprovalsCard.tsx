/**
 * 收件箱 · 审批请求卡片
 * 展示等待授权（awaiting_authorization）的工作流运行，点击直达对应模块。
 */
import { Button, Empty, Space, Spin, Tag, Typography } from "antd";
import { RightOutlined, AuditOutlined, SolutionOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import type { WorkflowRun } from "@finance-taxation/domain-model";
import { resourceTypeLabel, resourceTypePath } from "./inbox-helpers";

const { Text } = Typography;

const MAX_VISIBLE = 6;

interface InboxApprovalsCardProps {
  runs: WorkflowRun[];
  loading: boolean;
}

export function InboxApprovalsCard({ runs, loading }: InboxApprovalsCardProps) {
  const navigate = useNavigate();

  return (
    <section className="v3-section-shell" data-testid="inbox-approvals-card">
      <Space style={{ justifyContent: "space-between", width: "100%" }}>
        <Space size={8}>
          <Text strong>📝 审批请求</Text>
          {runs.length > 0 && <Tag color="warning">{runs.length} 项待审批</Tag>}
        </Space>
        <Button type="link" size="small" onClick={() => navigate("/audit")}>
          查看审计日志 <RightOutlined />
        </Button>
      </Space>

      {loading ? (
        <div style={{ padding: "24px 0", textAlign: "center" }}><Spin /></div>
      ) : runs.length === 0 ? (
        <Empty
          style={{ margin: "16px 0" }}
          image={<SolutionOutlined style={{ fontSize: 32, color: "#16a34a" }} />}
          description={
            <Space direction="vertical" size={2}>
              <Text>暂无待审批事项</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                下一步建议：工作流进入「待授权」状态后会自动出现在这里，无需主动查询。
              </Text>
            </Space>
          }
        />
      ) : (
        <Space direction="vertical" size={8} style={{ width: "100%", marginTop: 10 }}>
          {runs.slice(0, MAX_VISIBLE).map((run) => (
            <div
              key={run.id}
              onClick={() => navigate(resourceTypePath(run.resourceType))}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                borderRadius: 8, border: "1px solid rgba(20,40,60,0.08)",
                borderLeft: "3px solid #d97706",
                cursor: "pointer",
              }}
            >
              <AuditOutlined style={{ color: "#d97706" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Text strong style={{ fontSize: 13 }}>{run.resourceLabel || resourceTypeLabel(run.resourceType)}</Text>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>
                  {resourceTypeLabel(run.resourceType)} · 发起人 {run.initiatorName || "系统"}
                </div>
              </div>
              <Tag color="warning">待授权</Tag>
              <RightOutlined style={{ color: "#94a3b8", fontSize: 11 }} />
            </div>
          ))}
          {runs.length > MAX_VISIBLE && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              还有 {runs.length - MAX_VISIBLE} 项，请前往对应模块处理。
            </Text>
          )}
        </Space>
      )}
    </section>
  );
}
