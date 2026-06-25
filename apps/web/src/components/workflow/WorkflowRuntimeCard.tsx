import { useEffect, useMemo, useState } from "react";
import { Alert, Card, Descriptions, Skeleton, Space, Tag, Typography } from "antd";
import type { WorkflowCommandStatus, WorkflowResourceType, WorkflowState } from "@finance-taxation/domain-model";
import { getWorkflowRunDetail, listWorkflowRuns, type WorkflowRunDetail } from "../../lib/api";

const { Text } = Typography;

const WORKFLOW_STATE_META: Record<WorkflowState, { color: string; label: string }> = {
  draft: { color: "default", label: "草稿" },
  collecting_documents: { color: "gold", label: "补单中" },
  ready_for_review: { color: "cyan", label: "待复核" },
  under_review: { color: "processing", label: "复核中" },
  awaiting_authorization: { color: "purple", label: "待授权" },
  executing: { color: "blue", label: "执行中" },
  completed: { color: "success", label: "已完成" },
  blocked: { color: "error", label: "已阻塞" },
  cancelled: { color: "default", label: "已取消" },
  correcting: { color: "warning", label: "修正中" }
};

const COMMAND_STATUS_META: Record<WorkflowCommandStatus, { color: string; label: string }> = {
  waiting: { color: "default", label: "等待执行" },
  running: { color: "processing", label: "运行中" },
  succeeded: { color: "success", label: "已成功" },
  failed: { color: "error", label: "已失败" },
  cancelled: { color: "default", label: "已取消" }
};

interface WorkflowRuntimeCardProps {
  title: string;
  resourceType: WorkflowResourceType;
  resourceId?: string | null;
  emptyHint: string;
}

export function WorkflowRuntimeCard({
  title,
  resourceType,
  resourceId,
  emptyHint
}: WorkflowRuntimeCardProps) {
  const [loading, setLoading] = useState(false);
  const [authState, setAuthState] = useState<"unknown" | "granted" | "forbidden">("unknown");
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<WorkflowRunDetail | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!resourceId) {
        setDetail(null);
        setError(null);
        setAuthState("unknown");
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const runsPayload = await listWorkflowRuns({ resourceType, resourceId });
        if (cancelled) return;
        setAuthState("granted");
        const targetRun = runsPayload.items[0] ?? null;
        if (!targetRun) {
          setDetail(null);
          return;
        }
        const runDetail = await getWorkflowRunDetail(targetRun.id);
        if (cancelled) return;
        setDetail(runDetail);
      } catch (err) {
        if (cancelled) return;
        const message = (err as Error).message;
        if (message === "Forbidden") {
          setAuthState("forbidden");
          setDetail(null);
          setError(null);
          return;
        }
        setError(message);
        setDetail(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [resourceId, resourceType]);

  const latestCommand = detail?.commands[0] ?? null;
  const latestTransition = detail?.transitions[0] ?? null;
  const stateMeta = detail ? WORKFLOW_STATE_META[detail.run.currentState] : null;
  const commandMeta = latestCommand ? COMMAND_STATUS_META[latestCommand.status] : null;
  const authorizationSummary = useMemo(() => {
    if (!detail) return "尚未进入授权环节";
    if (detail.run.authorizerName) return `授权人：${detail.run.authorizerName}`;
    if (detail.run.currentState === "awaiting_authorization") return "当前等待授权";
    return "当前无需额外授权";
  }, [detail]);

  return (
    <Card
      title={title}
      size="small"
      style={{ borderRadius: 12 }}
      extra={
        detail && stateMeta ? (
          <Tag color={stateMeta.color}>{stateMeta.label}</Tag>
        ) : authState === "forbidden" ? (
          <Tag color="warning">无 workflow.view 权限</Tag>
        ) : null
      }
    >
      {!resourceId ? (
        <Alert type="info" showIcon message={emptyHint} />
      ) : loading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : authState === "forbidden" ? (
        <Alert
          type="warning"
          showIcon
          message="当前账号没有运行态查看权限"
          description="页面功能可继续使用，但无法查看 workflow runtime 的运行态与授权态。"
        />
      ) : error ? (
        <Alert type="error" showIcon message="运行态加载失败" description={error} />
      ) : !detail ? (
        <Alert type="info" showIcon message="尚未生成运行时记录" description={emptyHint} />
      ) : (
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Descriptions size="small" column={2}>
            <Descriptions.Item label="运行状态">
              <Tag color={stateMeta?.color}>{stateMeta?.label}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="授权状态">
              <Text>{authorizationSummary}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="最近命令">
              {latestCommand && commandMeta ? (
                <Space size={4} wrap>
                  <Text code>{latestCommand.commandType}</Text>
                  <Tag color={commandMeta.color}>{commandMeta.label}</Tag>
                </Space>
              ) : (
                <Text type="secondary">暂无命令执行记录</Text>
              )}
            </Descriptions.Item>
            <Descriptions.Item label="重试 / 补偿">
              <Text>
                {latestCommand ? `${latestCommand.attemptCount}/${latestCommand.retryPolicy.maxAttempts} 次` : "0/0 次"}
                {" · "}
                补偿 {detail.compensations.length} 条
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="最后推进">
              <Text>{latestTransition ? `${latestTransition.actorName} · ${latestTransition.basis}` : "暂无流转记录"}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="最近更新时间">
              <Text>{new Date(detail.run.updatedAt).toLocaleString("zh-CN")}</Text>
            </Descriptions.Item>
          </Descriptions>
          {detail.run.blockedReason ? (
            <Alert type="error" showIcon message="阻塞原因" description={detail.run.blockedReason} />
          ) : null}
          {latestCommand?.lastErrorDetail ? (
            <Alert
              type={latestCommand.status === "failed" ? "error" : "warning"}
              showIcon
              message={latestCommand.lastErrorCode || "执行提示"}
              description={latestCommand.lastErrorDetail}
            />
          ) : null}
        </Space>
      )}
    </Card>
  );
}
