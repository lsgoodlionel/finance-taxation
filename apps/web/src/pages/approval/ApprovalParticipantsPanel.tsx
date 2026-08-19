/**
 * 会签进度与动态加签（V14-B）。
 *
 * ## 为什么会签必须有这一屏
 *
 * 串行审批里「还差谁」等于「当前这一步的那个人」，不用问。会签之后
 * 「还差谁」是一个真问题——批过的人看到单据还没通过，会以为是自己没批成。
 * 把每个人的表态摆出来，那个疑问就没了。
 *
 * ## 加签按钮为什么不做前端判权
 *
 * 「只有当前步骤的参与人能加签」这条判断在服务端（`addParticipant`）。
 * 前端只按「实例还在进行中」显示按钮，点了没权限就报 403——
 * 前端再判一遍等于把同一条规则写两处，两处迟早说法不一致，
 * 而不一致的那一方通常是没人测的那一方。
 */

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Drawer,
  Empty,
  Input,
  List,
  Skeleton,
  Space,
  Tag,
  Timeline,
  Typography
} from "antd";
import { UserAddOutlined } from "@ant-design/icons";
import { toast } from "sonner";
import { errorMessage } from "../../lib/errors";
import {
  addApprovalParticipant,
  getApprovalHistory,
  type ApprovalActionRecord,
  type ApprovalParticipant,
  type ParticipantStatus
} from "../../lib/api-expense-control";

const PARTICIPANT_STATUS_META: Record<ParticipantStatus, { label: string; color: string }> = {
  pending: { label: "待处理", color: "default" },
  approved: { label: "已批准", color: "success" },
  rejected: { label: "已驳回", color: "error" }
};

const ACTION_LABELS: Record<string, string> = {
  approve: "批准",
  reject: "驳回",
  cancel: "撤回"
};

export interface ApprovalParticipantsPanelProps {
  instanceId: string | null;
  /** 当前步骤序号。用来把「这一步」与「后面几步」分开显示。 */
  currentStepOrder: number | null;
  /** 实例是否还在进行中。已结束的不显示加签。 */
  isPending: boolean;
  onClose: () => void;
  /** 加签成功后通知外层刷新待办——加签会改变「还差谁」。 */
  onChanged?: () => void;
}

export function ApprovalParticipantsPanel({
  instanceId,
  currentStepOrder,
  isPending,
  onClose,
  onChanged
}: ApprovalParticipantsPanelProps) {
  const [participants, setParticipants] = useState<ApprovalParticipant[]>([]);
  const [actions, setActions] = useState<ApprovalActionRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addingUserId, setAddingUserId] = useState("");
  const [adding, setAdding] = useState(false);

  const reload = useCallback(async () => {
    if (instanceId === null) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await getApprovalHistory(instanceId);
      setParticipants(data.participants ?? []);
      setActions(data.actions);
    } catch (error) {
      // 不静默：加载失败显示成空会被读成「这一步没人要批」。
      setLoadError(errorMessage(error, "审批详情加载失败"));
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleAdd = async () => {
    if (instanceId === null || addingUserId.trim() === "") return;
    setAdding(true);
    try {
      await addApprovalParticipant(instanceId, addingUserId.trim());
      toast.success("已加签，该步骤多等这个人");
      setAddingUserId("");
      await reload();
      onChanged?.();
    } catch (error) {
      toast.error(errorMessage(error, "加签失败"));
    } finally {
      setAdding(false);
    }
  };

  const currentStepParticipants = participants.filter((p) => p.stepOrder === currentStepOrder);
  const laterParticipants = participants.filter(
    (p) => currentStepOrder !== null && p.stepOrder > currentStepOrder
  );
  const doneCount = currentStepParticipants.filter((p) => p.status === "approved").length;

  return (
    <Drawer
      open={instanceId !== null}
      onClose={onClose}
      width={620}
      title="会签进度与加签"
      destroyOnClose
    >
      {loadError && <Alert type="error" showIcon message={loadError} style={{ marginBottom: 12 }} />}

      {loading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : (
        <Space direction="vertical" size={20} style={{ width: "100%" }}>
          <div>
            <Typography.Title level={5} style={{ marginBottom: 8 }}>
              当前步骤（第 {currentStepOrder ?? "—"} 步）
              {currentStepParticipants.length > 1 && (
                <Tag color={doneCount === currentStepParticipants.length ? "success" : "warning"}
                     style={{ marginLeft: 8 }}>
                  已批 {doneCount} / {currentStepParticipants.length}
                </Tag>
              )}
            </Typography.Title>

            {currentStepParticipants.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={isPending ? "这一步没有参与人" : "审批已结束"}
              />
            ) : (
              <List
                size="small"
                bordered
                dataSource={currentStepParticipants}
                renderItem={(item) => (
                  <List.Item>
                    <Space>
                      <Typography.Text code>{item.userId}</Typography.Text>
                      <Tag color={PARTICIPANT_STATUS_META[item.status].color}>
                        {PARTICIPANT_STATUS_META[item.status].label}
                      </Tag>
                      {/* 「本来就有的」与「审批中被拉进来的」要分得出来 */}
                      {item.isAdded && <Tag color="gold">加签</Tag>}
                    </Space>
                    {item.actedAt !== null && (
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {new Date(item.actedAt).toLocaleString("zh-CN")}
                      </Typography.Text>
                    )}
                  </List.Item>
                )}
              />
            )}
          </div>

          {isPending && (
            <div>
              <Typography.Title level={5} style={{ marginBottom: 4 }}>
                加签
              </Typography.Title>
              <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
                把人拉进<strong>当前这一步</strong>。会签下多一个人要批，或签下多一个人可以批。
                只有当前步骤的审批人能加签——这事你拿不准，才轮到你说「让他也看看」。
              </Typography.Paragraph>
              <Space.Compact style={{ width: "100%" }}>
                <Input
                  value={addingUserId}
                  onChange={(e) => setAddingUserId(e.target.value)}
                  placeholder="用户 id"
                  maxLength={64}
                  onPressEnter={() => void handleAdd()}
                />
                <Button
                  type="primary"
                  icon={<UserAddOutlined />}
                  loading={adding}
                  disabled={addingUserId.trim() === ""}
                  onClick={() => void handleAdd()}
                >
                  加签
                </Button>
              </Space.Compact>
            </div>
          )}

          {laterParticipants.length > 0 && (
            <div>
              <Typography.Title level={5} style={{ marginBottom: 8 }}>
                后面还要经过
              </Typography.Title>
              <Space wrap>
                {laterParticipants.map((item) => (
                  <Tag key={`${item.stepOrder}-${item.userId}`}>
                    第 {item.stepOrder} 步 · {item.userId}
                  </Tag>
                ))}
              </Space>
            </div>
          )}

          <div>
            <Typography.Title level={5} style={{ marginBottom: 8 }}>
              动作历史
            </Typography.Title>
            {actions.length === 0 ? (
              <Typography.Text type="secondary">还没有人动作</Typography.Text>
            ) : (
              <Timeline
                items={actions.map((action) => ({
                  color: action.action === "reject" ? "red" : "green",
                  children: (
                    <Space direction="vertical" size={0}>
                      <Typography.Text>
                        第 {action.step_order} 步 · {ACTION_LABELS[action.action] ?? action.action}
                        {" · "}
                        <Typography.Text code>{action.actor_user_id}</Typography.Text>
                      </Typography.Text>
                      {action.comment !== null && (
                        <Typography.Text type="secondary">{action.comment}</Typography.Text>
                      )}
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {new Date(action.acted_at).toLocaleString("zh-CN")}
                      </Typography.Text>
                    </Space>
                  )
                }))}
              />
            )}
          </div>
        </Space>
      )}
    </Drawer>
  );
}
