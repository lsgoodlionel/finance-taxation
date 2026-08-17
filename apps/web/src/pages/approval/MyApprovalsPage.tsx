/**
 * 我的审批（V13-A6）。
 *
 * pro 与 guided 两轨共用这一页——审批这件事对财务和业务人员是同一件事，
 * 没有必要做两套。差别只在导航入口。
 *
 * ## 与「我的一天」的分工
 *
 * `/inbox` 是**聚合视图**（所有待办，含审批），这里是**专项工作台**：
 * 一屏之内看清金额、进度、是不是最后一关，然后当场批或驳。
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Empty, Input, Modal, Skeleton, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { CheckOutlined, CloseOutlined, ReloadOutlined } from "@ant-design/icons";
import { toast } from "sonner";
import { PageHeader } from "../../components/ui/PageHeader";
import { errorMessage } from "../../lib/errors";
import {
  actOnApproval,
  listPendingApprovals,
  type ApprovalInstance
} from "../../lib/api-expense-control";
import {
  DOCUMENT_TYPE_LABELS,
  formatCents,
  isFinalStep,
  sortByRisk,
  stepProgress
} from "./approval-view";

export function MyApprovalsPage() {
  const [items, setItems] = useState<ApprovalInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ApprovalInstance | null>(null);
  const [rejectComment, setRejectComment] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await listPendingApprovals();
      setItems(data.items);
    } catch (error) {
      // 不静默：加载失败显示成空列表会让审批人以为没单要批，
      // 而单据就那么一直等着。
      setLoadError(errorMessage(error, "待办加载失败，请重试"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const sorted = useMemo(() => sortByRisk(items), [items]);

  const handleAct = async (
    instance: ApprovalInstance,
    action: "approve" | "reject",
    comment?: string
  ) => {
    setActing(instance.id);
    try {
      await actOnApproval(instance.id, { action, comment: comment ?? null });
      toast.success(action === "approve" ? "已批准" : "已驳回");
      await reload();
    } catch (error) {
      toast.error(errorMessage(error, "操作失败"));
    } finally {
      setActing(null);
    }
  };

  const columns: ColumnsType<ApprovalInstance> = [
    {
      title: "单据",
      key: "document",
      render: (_, row) => (
        <span>
          <Tag>{DOCUMENT_TYPE_LABELS[row.documentType]}</Tag>
          <Typography.Text code>{row.documentId}</Typography.Text>
        </span>
      )
    },
    {
      title: "金额",
      dataIndex: "amountCents",
      align: "right",
      width: 140,
      render: (value: number) => <Typography.Text strong>{formatCents(value)}</Typography.Text>
    },
    {
      title: "进度",
      key: "progress",
      width: 160,
      render: (_, row) => {
        const progress = stepProgress(row);
        if (!progress) return <Typography.Text type="secondary">进度未知</Typography.Text>;
        return (
          <Space size={4}>
            <span>
              第 {progress.current} / {progress.total} 步
            </span>
            {/* 最后一关要说明白：批下去就生效了，没有下一个人把关。 */}
            {isFinalStep(row) && <Tag color="orange">最后一关</Tag>}
          </Space>
        );
      }
    },
    {
      title: "操作",
      key: "actions",
      width: 180,
      render: (_, row) => (
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<CheckOutlined />}
            loading={acting === row.id}
            onClick={() => void handleAct(row, "approve")}
          >
            批准
          </Button>
          <Button
            danger
            size="small"
            icon={<CloseOutlined />}
            disabled={acting === row.id}
            onClick={() => {
              setRejectComment("");
              setRejecting(row);
            }}
          >
            驳回
          </Button>
        </Space>
      )
    }
  ];

  return (
    <div>
      <PageHeader
        title="我的审批"
        subtitle="金额大的排在前面。驳回会直接退回发起人，不退给上一级。"
        actions={
          <Button icon={<ReloadOutlined />} onClick={() => void reload()}>
            刷新
          </Button>
        }
      />

      {loadError && (
        <Alert
          type="error"
          showIcon
          message="待办加载失败"
          description={loadError}
          style={{ marginBottom: 16 }}
          action={
            <Button size="small" onClick={() => void reload()}>
              重试
            </Button>
          }
        />
      )}

      {loading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : sorted.length === 0 && !loadError ? (
        <Empty description="没有待你处理的审批" />
      ) : (
        <Table<ApprovalInstance>
          rowKey="id"
          size="small"
          dataSource={sorted}
          columns={columns}
          pagination={false}
        />
      )}

      <Modal
        open={rejecting !== null}
        title="驳回原因"
        okText="确认驳回"
        okButtonProps={{ danger: true }}
        cancelText="取消"
        onCancel={() => setRejecting(null)}
        onOk={() => {
          if (!rejecting) return;
          const target = rejecting;
          setRejecting(null);
          void handleAct(target, "reject", rejectComment.trim() || undefined);
        }}
      >
        <Typography.Paragraph type="secondary">
          驳回后单据直接退回发起人，需要重新提交。写清楚原因能省掉一轮来回。
        </Typography.Paragraph>
        <Input.TextArea
          rows={3}
          maxLength={200}
          showCount
          value={rejectComment}
          onChange={(e) => setRejectComment(e.target.value)}
          placeholder="例如：发票抬头不是公司名称，请换开后重提"
        />
      </Modal>
    </div>
  );
}
