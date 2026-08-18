/**
 * 合同付款计划面板（V13 残留 10）。
 *
 * 付款中心能看能付，但合同详情页里看不到——而「这份合同怎么付」恰恰是
 * 看合同时最想知道的事。
 *
 * ## 位置：元数据之下、履行记录之上
 *
 * 先看钱怎么付，再看关联了什么。这是蓝图第二节定的顺序。
 *
 * ## 进度用三个数而不是一个百分比
 *
 * 已付 / 待付 / 质保金。合成一个「已付 90%」会让人以为还差一笔正常的款，
 * 而实际可能是「主体已付清、只剩质保金没到期」——那是完全不同的状态。
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tag,
  Typography
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { toast } from "sonner";
import { errorMessage } from "../../lib/errors";
import {
  cancelContractSchedule,
  createContractSchedule,
  listContractSchedules,
  type ContractPaymentProgress,
  type PaymentSchedule,
  type PaymentScheduleType
} from "../../lib/api-expense-control";
import { SCHEDULE_STATUS_META, formatCents } from "../payments/payment-view";
import { describeProgress } from "../payments/payment-view";

interface CreateValues {
  periodNo: number;
  title: string;
  dueDate: Dayjs;
  amountYuan: number;
  scheduleType: PaymentScheduleType;
  retentionReleaseDate?: Dayjs;
}

export interface ContractSchedulePanelProps {
  contractId: string;
  /** 合同总额（元），用于提示各期之和是否对得上。 */
  contractAmount: number;
  /** 没有 contracts.manage 权限时只读。 */
  canManage?: boolean;
}

export function ContractSchedulePanel({
  contractId,
  contractAmount,
  canManage = true
}: ContractSchedulePanelProps) {
  const [items, setItems] = useState<PaymentSchedule[]>([]);
  const [progress, setProgress] = useState<ContractPaymentProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<CreateValues>();
  const scheduleType = Form.useWatch("scheduleType", form);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await listContractSchedules(contractId);
      setItems(data.items);
      setProgress(data.progress);
    } catch (error) {
      // 不静默：加载失败显示成空会被读成「这份合同没有付款计划」，
      // 于是有人再录一遍，撞上期次重复。
      setLoadError(errorMessage(error, "付款计划加载失败"));
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleCreate = async (values: CreateValues) => {
    setSubmitting(true);
    try {
      await createContractSchedule(contractId, {
        periodNo: values.periodNo,
        title: values.title.trim(),
        dueDate: values.dueDate.format("YYYY-MM-DD"),
        amountCents: Math.round(values.amountYuan * 100),
        scheduleType: values.scheduleType,
        retentionReleaseDate:
          values.scheduleType === "retention" && values.retentionReleaseDate
            ? values.retentionReleaseDate.format("YYYY-MM-DD")
            : null
      });
      toast.success("期次已添加");
      setCreating(false);
      form.resetFields();
      await reload();
    } catch (error) {
      toast.error(errorMessage(error, "添加失败"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = (schedule: PaymentSchedule) => {
    Modal.confirm({
      title: `作废第 ${schedule.periodNo} 期？`,
      content: "已有付款记录的期次不能作废——那些钱已经付出去了，作废会让合同的已付合计凭空少一块。",
      okText: "作废",
      cancelText: "取消",
      onOk: async () => {
        try {
          await cancelContractSchedule(schedule.id);
          toast.success("已作废");
          await reload();
        } catch (error) {
          toast.error(errorMessage(error, "作废失败"));
        }
      }
    });
  };

  const columns: ColumnsType<PaymentSchedule> = [
    { title: "期次", dataIndex: "periodNo", width: 60 },
    {
      title: "名称",
      dataIndex: "title",
      render: (value: string, row) => (
        <Space size={4}>
          <span>{value}</span>
          {row.scheduleType === "retention" && <Tag color="purple">质保金</Tag>}
        </Space>
      )
    },
    { title: "约定日期", dataIndex: "dueDate", width: 110 },
    {
      title: "金额",
      dataIndex: "amountCents",
      align: "right",
      width: 110,
      render: (value: number) => formatCents(value)
    },
    {
      title: "已付",
      dataIndex: "paidCents",
      align: "right",
      width: 110,
      // 已付来自付款单汇总，不是这张表上的字段。
      render: (value: number) =>
        value > 0 ? formatCents(value) : <Typography.Text type="secondary">—</Typography.Text>
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (status: PaymentSchedule["status"]) => (
        <Tag color={SCHEDULE_STATUS_META[status].color}>{SCHEDULE_STATUS_META[status].label}</Tag>
      )
    },
    ...(canManage
      ? [
          {
            title: "操作",
            key: "actions",
            width: 80,
            render: (_: unknown, row: PaymentSchedule) =>
              row.isCancelled || row.paidCents > 0 ? (
                <Typography.Text type="secondary">—</Typography.Text>
              ) : (
                <Button size="small" danger onClick={() => handleCancel(row)}>
                  作废
                </Button>
              )
          } as ColumnsType<PaymentSchedule>[number]
        ]
      : [])
  ];

  const plannedTotal = items
    .filter((item) => !item.isCancelled)
    .reduce((sum, item) => sum + item.amountCents, 0);
  const contractCents = Math.round(contractAmount * 100);

  return (
    <div>
      {loadError && (
        <Alert type="error" showIcon message={loadError} style={{ marginBottom: 12 }} />
      )}

      {loading ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : (
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          {progress && progress.totalCents > 0 && (
            <div>
              <Space size="large" wrap>
                <Statistic
                  title="已付"
                  value={progress.paidCents / 100}
                  precision={2}
                  suffix="元"
                />
                <Statistic
                  title="待付"
                  value={progress.unpaidCents / 100}
                  precision={2}
                  suffix="元"
                />
                {progress.retentionCents > 0 && (
                  <Statistic
                    title="质保金"
                    value={progress.retentionCents / 100}
                    precision={2}
                    suffix="元"
                  />
                )}
              </Space>
              <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
                {describeProgress(progress)}
              </Typography.Paragraph>
            </div>
          )}

          {/* 各期之和与合同额不符时提示，但**不拦**：分期先录一部分、
              合同含税不含税口径不同，都是正常情况。 */}
          {items.length > 0 && plannedTotal !== contractCents && (
            <Alert
              type="warning"
              showIcon
              message={`各期合计 ${formatCents(plannedTotal)} 元，与合同金额 ${formatCents(contractCents)} 元不一致`}
              description="如果是分期录入或含税口径不同，可以忽略。"
            />
          )}

          {items.length === 0 ? (
            <Empty description="还没有付款计划">
              {canManage && (
                <Button type="primary" onClick={() => setCreating(true)}>
                  添加第一期
                </Button>
              )}
            </Empty>
          ) : (
            <>
              <Table<PaymentSchedule>
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={items}
                columns={columns}
              />
              {canManage && (
                <Button size="small" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
                  添加一期
                </Button>
              )}
            </>
          )}
        </Space>
      )}

      <Modal
        open={creating}
        title="添加付款期次"
        okText="保存"
        cancelText="取消"
        confirmLoading={submitting}
        onCancel={() => setCreating(false)}
        onOk={() => form.submit()}
      >
        <Form<CreateValues>
          form={form}
          layout="vertical"
          initialValues={{
            periodNo: items.length + 1,
            scheduleType: "normal",
            dueDate: dayjs()
          }}
          onFinish={(values) => void handleCreate(values)}
        >
          <Space align="start">
            <Form.Item name="periodNo" label="期次" rules={[{ required: true }]}>
              <InputNumber min={1} precision={0} style={{ width: 90 }} />
            </Form.Item>
            <Form.Item
              name="title"
              label="名称"
              rules={[{ required: true, message: "请填写期次名称" }]}
            >
              <Input placeholder="首付款 / 进度款 / 尾款 / 质保金" style={{ width: 240 }} />
            </Form.Item>
          </Space>

          <Space align="start">
            <Form.Item
              name="amountYuan"
              label="金额（元）"
              rules={[{ required: true, message: "请填写金额" }]}
            >
              <InputNumber min={0} precision={2} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="dueDate" label="约定付款日" rules={[{ required: true }]}>
              <DatePicker style={{ width: 160 }} />
            </Form.Item>
          </Space>

          <Form.Item
            name="scheduleType"
            label="期次类型"
            extra="质保金作为独立一期，合同才能表达「主体已付清、质保金待释放」这个状态"
          >
            <Select
              options={[
                { value: "normal", label: "常规期次" },
                { value: "retention", label: "质保金" }
              ]}
            />
          </Form.Item>

          {scheduleType === "retention" && (
            <Form.Item
              name="retentionReleaseDate"
              label="质保金到期日"
              extra="没设到期日则不可释放——那说明合同条款还没录全，默认可释放会让钱提前付出去"
            >
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
