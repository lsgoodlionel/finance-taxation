/**
 * 申请与借款（V13-B8）。
 *
 * 三件事：**我的申请**、**我要申请**、**借款与备用金**。
 * 用 TaskFocusShell 一次只渲染一件，与 /budget、/rnd 同构。
 *
 * ## pro 与 guided 共用这一页
 *
 * 审批、申请这类事对财务和业务人员是同一件事，没必要做两套。差别只在
 * 导航入口：guided 轨叫「我要申请」（直接落到发起那一件事），
 * pro 轨叫「申请与借款」（默认落到列表）。
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Alert, Button, Empty, Skeleton, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { toast } from "sonner";
import { PageHeader } from "../../components/ui/PageHeader";
import { TaskFocusShell } from "../../components/ui/TaskFocusShell";
import { errorMessage, todayIso } from "../../lib/errors";
import { listCostCenters } from "../../lib/api";
import {
  createRequest,
  listAdvances,
  listRequests,
  transitionRequest,
  type AdvanceRow,
  type RequestAction,
  type RequestRow
} from "../../lib/api-expense-control";
import { RequestCreateForm, type CostCenterOption } from "./RequestCreateForm";
import {
  ADVANCE_STATUS_META,
  REQUEST_ACTION_LABELS,
  REQUEST_STATUS_META,
  REQUEST_TYPE_LABELS,
  availableRequestActions,
  formatCents,
  isAdvanceOverdue
} from "./request-view";

const TASK_KEYS = ["mine", "create", "advances"] as const;
type RequestTaskKey = (typeof TASK_KEYS)[number];

function isTaskKey(value: string | null): value is RequestTaskKey {
  return value !== null && (TASK_KEYS as readonly string[]).includes(value);
}

export function RequestsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [advances, setAdvances] = useState<AdvanceRow[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const task: RequestTaskKey = isTaskKey(searchParams.get("task"))
    ? (searchParams.get("task") as RequestTaskKey)
    : "mine";

  const setTask = useCallback(
    (next: RequestTaskKey) => {
      const params = new URLSearchParams(searchParams);
      params.set("task", next);
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // 两个列表一起取：切换任务时不该再等一次网络。
      const [requestData, advanceData] = await Promise.all([
        listRequests({ mine: true }),
        listAdvances({ mine: true })
      ]);
      setRequests(requestData.items);
      setAdvances(advanceData.items);
    } catch (error) {
      // 不静默：加载失败显示成空列表会让用户以为自己没提过单，
      // 于是又提一遍。
      setLoadError(errorMessage(error, "加载失败，请重试"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    listCostCenters()
      .then((data) => setCostCenters(data.items.map((item) => ({ id: item.id, name: item.name }))))
      .catch(() => setCostCenters([]));
  }, []);

  const costCenterNames = useMemo(
    () => Object.fromEntries(costCenters.map((item) => [item.id, item.name])),
    [costCenters]
  );

  const today = todayIso();
  const overdueCount = useMemo(
    () => advances.filter((item) => isAdvanceOverdue(item, today)).length,
    [advances, today]
  );

  const handleAction = async (row: RequestRow, action: RequestAction) => {
    setActing(row.id);
    try {
      await transitionRequest(row.id, action);
      toast.success(`${REQUEST_ACTION_LABELS[action]}成功`);
      await reload();
    } catch (error) {
      toast.error(errorMessage(error, "操作失败"));
    } finally {
      setActing(null);
    }
  };

  const requestColumns: ColumnsType<RequestRow> = [
    {
      title: "单据",
      key: "no",
      render: (_, row) => (
        <span>
          <Tag>{REQUEST_TYPE_LABELS[row.requestType]}</Tag>
          <Typography.Text code>{row.requestNo}</Typography.Text>
        </span>
      )
    },
    { title: "事由", dataIndex: "title", ellipsis: true },
    {
      title: "金额",
      dataIndex: "amountCents",
      align: "right",
      width: 130,
      render: (value: number) => formatCents(value)
    },
    { title: "预计发生日", dataIndex: "expectedDate", width: 120 },
    {
      title: "部门",
      dataIndex: "costCenterId",
      width: 110,
      render: (value: string | null) =>
        value === null ? (
          <Typography.Text type="secondary">未指定</Typography.Text>
        ) : (
          costCenterNames[value] ?? value
        )
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (status: RequestRow["status"]) => (
        <Tag color={REQUEST_STATUS_META[status].color}>{REQUEST_STATUS_META[status].label}</Tag>
      )
    },
    {
      title: "操作",
      key: "actions",
      width: 220,
      render: (_, row) => {
        const actions = availableRequestActions(row.status);
        if (actions.length === 0) {
          return <Typography.Text type="secondary">—</Typography.Text>;
        }
        return (
          <Space size={4}>
            {actions.map((action) => (
              <Button
                key={action}
                size="small"
                type={action === "submit" ? "primary" : "default"}
                danger={action === "cancel"}
                loading={acting === row.id}
                onClick={() => void handleAction(row, action)}
              >
                {REQUEST_ACTION_LABELS[action]}
              </Button>
            ))}
          </Space>
        );
      }
    }
  ];

  const advanceColumns: ColumnsType<AdvanceRow> = [
    {
      title: "单据",
      dataIndex: "advanceNo",
      render: (value: string) => <Typography.Text code>{value}</Typography.Text>
    },
    { title: "事由", dataIndex: "purpose", ellipsis: true },
    {
      title: "借款金额",
      dataIndex: "amountCents",
      align: "right",
      width: 120,
      render: (value: number) => formatCents(value)
    },
    {
      title: "未还余额",
      dataIndex: "outstandingCents",
      align: "right",
      width: 130,
      render: (value: number) => (
        // 余额来自账上（1221 该往来单位的净额），不是单据上的字段。
        // 负数意味着报销超过借款、公司该补给员工。
        <Typography.Text strong type={value > 0 ? "warning" : value < 0 ? "danger" : undefined}>
          {formatCents(value)}
        </Typography.Text>
      )
    },
    {
      title: "应还日期",
      dataIndex: "expectedReturnDate",
      width: 130,
      render: (value: string | null, row) =>
        value === null ? (
          <Typography.Text type="secondary">—</Typography.Text>
        ) : isAdvanceOverdue(row, today) ? (
          <Typography.Text type="danger">{value}（逾期）</Typography.Text>
        ) : (
          value
        )
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (status: AdvanceRow["status"]) => (
        <Tag color={ADVANCE_STATUS_META[status].color}>{ADVANCE_STATUS_META[status].label}</Tag>
      )
    }
  ];

  const handleCreate = async (body: Parameters<typeof createRequest>[0]) => {
    setSubmitting(true);
    try {
      const created = await createRequest(body);
      toast.success(`已保存草稿 ${created.request.requestNo}`);
      setTask("mine");
      await reload();
    } catch (error) {
      toast.error(errorMessage(error, "保存失败"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="申请与借款"
        subtitle="事前申请批准后才占用预算；借款的未还余额直接取自账上"
        actions={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void reload()}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setTask("create")}>
              发起申请
            </Button>
          </Space>
        }
      />

      {loadError && (
        <Alert
          type="error"
          showIcon
          message="加载失败"
          description={loadError}
          style={{ marginBottom: 16 }}
          action={
            <Button size="small" onClick={() => void reload()}>
              重试
            </Button>
          }
        />
      )}

      {overdueCount > 0 && (
        <Alert
          type="warning"
          showIcon
          message={`有 ${overdueCount} 笔借款逾期未还`}
          description="判据是账上仍有余额且过了应还日期，不是单据状态——状态可以被改，账不能。"
          style={{ marginBottom: 16 }}
        />
      )}

      <TaskFocusShell
        tasks={[
          { key: "mine", label: "我的申请", description: "我提过的单子走到哪一步了" },
          { key: "create", label: "我要申请", description: "出差 / 采购 / 用款" },
          {
            key: "advances",
            label: "借款与备用金",
            description: "借了多少、还欠多少",
            badge: overdueCount || undefined
          }
        ]}
        activeKey={task}
        onSelectTask={(key) => setTask(key as RequestTaskKey)}
        switcherLabel="申请与借款任务"
      >
        {task === "create" ? (
          <RequestCreateForm
            costCenters={costCenters}
            submitting={submitting}
            onSubmit={(body) => void handleCreate(body)}
          />
        ) : task === "advances" ? (
          loading ? (
            <Skeleton active paragraph={{ rows: 3 }} />
          ) : advances.length === 0 ? (
            <Empty description="还没有借款记录" />
          ) : (
            <Table<AdvanceRow>
              rowKey="id"
              size="small"
              dataSource={advances}
              columns={advanceColumns}
              pagination={false}
            />
          )
        ) : loading ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : requests.length === 0 && !loadError ? (
          <Empty description="还没有申请单">
            <Button type="primary" onClick={() => setTask("create")}>
              发起第一张申请
            </Button>
          </Empty>
        ) : (
          <Table<RequestRow>
            rowKey="id"
            size="small"
            dataSource={requests}
            columns={requestColumns}
            pagination={false}
          />
        )}
      </TaskFocusShell>
    </div>
  );
}
