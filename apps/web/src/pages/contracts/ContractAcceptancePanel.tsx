/**
 * 合同验收面板（V13 缺口 12）。
 *
 * 验收单的迁移、接口、测试在残留 7 就做完了，但**页面上建不了**——
 * 「后端有能力、没入口」的第六次，而这次是收尾时自己留下的。
 *
 * ## 挂在合同抽屉，与付款计划并列
 *
 * 验收是合同履行的一环，与付款计划是同一件事的两面：一个说「什么时候
 * 该付多少」，一个说「东西什么时候真的收到了」。放一起，看合同的人
 * 一屏就能对上。
 *
 * ## 累计已验收当场算
 *
 * 与服务端同一口径——那边也不存这个数（按 confirmed 状态汇总）。
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  createAcceptance,
  listAcceptances,
  listContractSchedules,
  transitionAcceptance,
  type Acceptance,
  type PaymentSchedule
} from "../../lib/api-expense-control";
import { formatCents } from "../payments/payment-view";

const STATUS_META: Record<Acceptance["status"], { label: string; color: string }> = {
  draft: { label: "草稿", color: "default" },
  confirmed: { label: "已确认", color: "success" },
  cancelled: { label: "已作废", color: "default" }
};

interface CreateValues {
  acceptedOn: Dayjs;
  amountYuan: number;
  quantityNote: string;
  scheduleId?: string;
  note?: string;
}

export interface ContractAcceptancePanelProps {
  contractId: string;
  canManage?: boolean;
}

export function ContractAcceptancePanel({
  contractId,
  canManage = true
}: ContractAcceptancePanelProps) {
  const [items, setItems] = useState<Acceptance[]>([]);
  const [schedules, setSchedules] = useState<PaymentSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<CreateValues>();

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [acceptanceData, scheduleData] = await Promise.all([
        listAcceptances({ contractId }),
        // 期次列表用于「这次验收对应哪一期」的选择器。取不到不影响主流程。
        listContractSchedules(contractId).catch(() => ({ items: [], progress: null }))
      ]);
      setItems(acceptanceData.items);
      setSchedules(scheduleData.items as PaymentSchedule[]);
    } catch (error) {
      // 不静默：加载失败显示成空会被读成「这份合同还没验收过」，
      // 于是有人再录一遍。
      setLoadError(errorMessage(error, "验收记录加载失败"));
    } finally {
      setLoading(false);
    }
  }, [contractId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // 与服务端同一口径：只算 confirmed 的。草稿不算数——还没确认。
  const confirmedCents = useMemo(
    () =>
      items
        .filter((item) => item.status === "confirmed")
        .reduce((sum, item) => sum + item.amountCents, 0),
    [items]
  );

  const handleCreate = async (values: CreateValues) => {
    setSubmitting(true);
    try {
      await createAcceptance({
        contractId,
        scheduleId: values.scheduleId ?? null,
        acceptedOn: values.acceptedOn.format("YYYY-MM-DD"),
        amountCents: Math.round(values.amountYuan * 100),
        quantityNote: values.quantityNote?.trim() ?? "",
        note: values.note?.trim() || null
      });
      toast.success("验收单已创建，确认后才计入三单匹配");
      setCreating(false);
      form.resetFields();
      await reload();
    } catch (error) {
      toast.error(errorMessage(error, "创建失败"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleTransition = async (row: Acceptance, action: "confirm" | "cancel") => {
    try {
      await transitionAcceptance(row.id, action);
      toast.success(action === "confirm" ? "已确认" : "已作废");
      await reload();
    } catch (error) {
      toast.error(errorMessage(error, "操作失败"));
    }
  };

  const columns: ColumnsType<Acceptance> = [
    {
      title: "验收单号",
      dataIndex: "acceptanceNo",
      render: (value: string) => <Typography.Text code>{value}</Typography.Text>
    },
    { title: "验收日期", dataIndex: "acceptedOn", width: 110 },
    {
      title: "对应期次",
      dataIndex: "scheduleId",
      width: 130,
      render: (value: string | null) => {
        if (value === null) {
          // 不填期次是合法的：一次性验收的合同就是这样，那张单属于整个合同。
          return <Typography.Text type="secondary">整份合同</Typography.Text>;
        }
        const schedule = schedules.find((item) => item.id === value);
        return schedule ? `第 ${schedule.periodNo} 期 ${schedule.title}` : value;
      }
    },
    {
      title: "金额",
      dataIndex: "amountCents",
      align: "right",
      width: 110,
      render: (value: number) => formatCents(value)
    },
    { title: "数量/规格", dataIndex: "quantityNote", ellipsis: true },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (status: Acceptance["status"]) => (
        <Tag color={STATUS_META[status].color}>{STATUS_META[status].label}</Tag>
      )
    },
    ...(canManage
      ? [
          {
            title: "操作",
            key: "actions",
            width: 130,
            render: (_: unknown, row: Acceptance) => {
              if (row.status === "draft") {
                return (
                  <Space size={4}>
                    <Button
                      size="small"
                      type="primary"
                      onClick={() => void handleTransition(row, "confirm")}
                    >
                      确认
                    </Button>
                    <Button size="small" onClick={() => void handleTransition(row, "cancel")}>
                      作废
                    </Button>
                  </Space>
                );
              }
              if (row.status === "confirmed") {
                // 已确认的可以作废（验收后发现质量问题、退货），但不能退回草稿——
                // 那会让「确认过」这个事实消失，而三单匹配已经按它算过了。
                return (
                  <Button size="small" danger onClick={() => void handleTransition(row, "cancel")}>
                    作废
                  </Button>
                );
              }
              return <Typography.Text type="secondary">—</Typography.Text>;
            }
          } as ColumnsType<Acceptance>[number]
        ]
      : [])
  ];

  return (
    <div>
      {loadError && (
        <Alert type="error" showIcon message={loadError} style={{ marginBottom: 12 }} />
      )}

      {loading ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : (
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          {items.length > 0 && (
            <Space size="large">
              <Statistic
                title="累计已验收"
                value={confirmedCents / 100}
                precision={2}
                suffix="元"
              />
              <Statistic
                title="待确认"
                value={items.filter((item) => item.status === "draft").length}
                suffix="张"
              />
            </Space>
          )}

          <Alert
            type="info"
            showIcon
            message="只有「已确认」的验收单计入三单匹配"
            description="草稿状态不算数。付款时会把「合同期次 × 验收 × 发票」三方差异摆出来——不阻断付款，但让审批人看得见是预付还是正常结算。"
          />

          {items.length === 0 ? (
            <Empty description="还没有验收记录">
              {canManage && (
                <Button type="primary" onClick={() => setCreating(true)}>
                  录第一张验收单
                </Button>
              )}
            </Empty>
          ) : (
            <>
              <Table<Acceptance>
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={items}
                columns={columns}
              />
              {canManage && (
                <Button size="small" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
                  录验收单
                </Button>
              )}
            </>
          )}
        </Space>
      )}

      <Modal
        open={creating}
        title="录验收单"
        okText="保存为草稿"
        cancelText="取消"
        confirmLoading={submitting}
        onCancel={() => setCreating(false)}
        onOk={() => form.submit()}
      >
        <Form<CreateValues>
          form={form}
          layout="vertical"
          initialValues={{ acceptedOn: dayjs() }}
          onFinish={(values) => void handleCreate(values)}
        >
          <Space align="start">
            <Form.Item name="acceptedOn" label="验收日期" rules={[{ required: true }]}>
              <DatePicker style={{ width: 160 }} />
            </Form.Item>
            <Form.Item
              name="amountYuan"
              label="验收金额（元）"
              rules={[{ required: true, message: "请填写验收金额" }]}
              extra="三单匹配比的是钱"
            >
              <InputNumber min={0} precision={2} style={{ width: 160 }} />
            </Form.Item>
          </Space>

          <Form.Item
            name="scheduleId"
            label="对应期次"
            extra="留空表示整份合同一次性验收——设备签收这类合同就是这样"
          >
            <Select
              allowClear
              placeholder="整份合同"
              options={schedules
                .filter((item) => !item.isCancelled)
                .map((item) => ({
                  value: item.id,
                  label: `第 ${item.periodNo} 期 ${item.title}（${formatCents(item.amountCents)} 元）`
                }))}
            />
          </Form.Item>

          <Form.Item
            name="quantityNote"
            label="数量与规格"
            extra="自由填写，如「服务器 10 台，型号 R740」。不做结构化的数量+单位——标的物千差万别，换算错了比不写更糟"
          >
            <Input.TextArea rows={2} maxLength={200} showCount />
          </Form.Item>

          <Form.Item name="note" label="备注">
            <Input.TextArea rows={2} maxLength={200} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
