/**
 * 费用标准配置（V13 残留 1）。
 *
 * ## 为什么这个界面必须有
 *
 * V13-A 做完时，费用标准只能通过接口或种子建——于是超标检查在真实客户那里
 * 形同虚设：没人配得了标准，`matchExpenseStandard` 永远返回 null，
 * `checkExpenseStandard` 永远返回「未配置」。
 *
 * ## 按费用类型分组，组内按具体度排序
 *
 * 排序规则与服务端 `match.ts` 的挑选规则**完全一致**（职级 2 分、城市 1 分、
 * id 决胜）。这样用户看到的第一条就是真正会生效的那条——否则他会照着一条
 * 不生效的标准去调金额，改半天没有任何效果。
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { PlusOutlined, ReloadOutlined, StopOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { toast } from "sonner";
import { errorMessage, todayIso } from "../../../lib/errors";
import {
  createExpenseStandard,
  expireExpenseStandard,
  listExpenseStandards,
  type ExpenseLimitBasis,
  type ExpenseOverPolicy,
  type ExpenseStandard
} from "../../../lib/api-expense-control";
import {
  CITY_TIER_LABELS,
  EXPENSE_TYPE_OPTIONS,
  LIMIT_BASIS_LABELS,
  OVER_POLICY_META,
  describeScope,
  formatCents,
  groupByType,
  isActiveOn
} from "./standard-view";

interface CreateFormValues {
  expenseType: string;
  gradeCode?: string;
  cityTier?: string;
  limitYuan: number;
  limitBasis: ExpenseLimitBasis;
  overPolicy: ExpenseOverPolicy;
  effectiveFrom: Dayjs;
}

export function ExpenseStandardsPanel() {
  const [items, setItems] = useState<ExpenseStandard[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm<CreateFormValues>();

  const today = todayIso();

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await listExpenseStandards();
      setItems(data.items);
    } catch (error) {
      // 不静默：加载失败显示成空列表会被读成「还没配过标准」，
      // 于是用户又配一遍，撞上重叠检查再被拒。
      setLoadError(errorMessage(error, "费用标准加载失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleCreate = async (values: CreateFormValues) => {
    setSubmitting(true);
    try {
      await createExpenseStandard({
        expenseType: values.expenseType,
        gradeCode: values.gradeCode?.trim() || null,
        cityTier: values.cityTier || null,
        // 表单收元、接口收分。在这里换算并取整——小数分会被后端直接拒，
        // 而用户看不懂那句话。
        limitCents: Math.round(values.limitYuan * 100),
        limitBasis: values.limitBasis,
        overPolicy: values.overPolicy,
        effectiveFrom: values.effectiveFrom.format("YYYY-MM-DD")
      });
      toast.success("标准已新增");
      setCreating(false);
      form.resetFields();
      await reload();
    } catch (error) {
      toast.error(errorMessage(error, "新增失败"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleExpire = (standard: ExpenseStandard) => {
    Modal.confirm({
      title: "停用这条标准？",
      // 说清楚是「停用」不是「删除」：历史单据是按当时的标准判定的，
      // 删掉之后「这笔当年为什么判为合规」就永远答不上来了。
      content:
        "会把生效止日设为今天，之后的单据不再按它判定。已经判过的历史单据不受影响——" +
        "标准不会被删除，那段历史要留着。",
      okText: "停用",
      cancelText: "取消",
      onOk: async () => {
        try {
          await expireExpenseStandard(standard.id, today);
          toast.success("已停用");
          await reload();
        } catch (error) {
          toast.error(errorMessage(error, "停用失败"));
        }
      }
    });
  };

  const columns: ColumnsType<ExpenseStandard> = [
    {
      title: "适用范围",
      key: "scope",
      render: (_, row) => (
        <Space size={4}>
          <span>{describeScope(row)}</span>
          {/* 组内第一条就是真正生效的那条——与服务端挑选规则一致。 */}
          {!isActiveOn(row, today) && <Tag>未生效/已停用</Tag>}
        </Space>
      )
    },
    {
      title: "限额",
      key: "limit",
      width: 160,
      render: (_, row) => (
        <span>
          {formatCents(row.limitCents)} 元
          <Typography.Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
            /{LIMIT_BASIS_LABELS[row.limitBasis]}
          </Typography.Text>
        </span>
      )
    },
    {
      title: "超标时",
      dataIndex: "overPolicy",
      width: 110,
      render: (policy: ExpenseOverPolicy) => (
        <Tooltip title={OVER_POLICY_META[policy].hint}>
          <Tag color={OVER_POLICY_META[policy].color}>{OVER_POLICY_META[policy].label}</Tag>
        </Tooltip>
      )
    },
    {
      title: "生效期",
      key: "effective",
      width: 200,
      render: (_, row) => (
        <Typography.Text type="secondary">
          {row.effectiveFrom} 起{row.effectiveTo ? ` 至 ${row.effectiveTo}` : ""}
        </Typography.Text>
      )
    },
    {
      title: "操作",
      key: "actions",
      width: 90,
      render: (_, row) =>
        isActiveOn(row, today) ? (
          <Button size="small" danger icon={<StopOutlined />} onClick={() => handleExpire(row)}>
            停用
          </Button>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        )
    }
  ];

  const groups = groupByType(items);

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ReloadOutlined />} onClick={() => void reload()}>
          刷新
        </Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
          新增标准
        </Button>
      </Space>

      {loadError && (
        <Alert
          type="error"
          showIcon
          message="加载失败"
          description={loadError}
          style={{ marginBottom: 16 }}
        />
      )}

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="同一类费用下，更具体的标准优先"
        description="职级比城市更具体。列表已按实际生效顺序排列——每组第一条就是会被用上的那条。留空表示不限。"
      />

      {loading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : groups.length === 0 ? (
        <Empty description="还没有费用标准。没有标准，超标检查不会生效。">
          <Button type="primary" onClick={() => setCreating(true)}>
            配第一条标准
          </Button>
        </Empty>
      ) : (
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          {groups.map((group) => (
            <Card key={group.expenseType} size="small" title={group.label}>
              <Table<ExpenseStandard>
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={group.items}
                columns={columns}
              />
            </Card>
          ))}
        </Space>
      )}

      <Modal
        open={creating}
        title="新增费用标准"
        okText="保存"
        cancelText="取消"
        confirmLoading={submitting}
        onCancel={() => setCreating(false)}
        onOk={() => form.submit()}
      >
        <Form<CreateFormValues>
          form={form}
          layout="vertical"
          initialValues={{
            limitBasis: "per_day",
            overPolicy: "warn",
            effectiveFrom: dayjs()
          }}
          onFinish={(values) => void handleCreate(values)}
        >
          <Form.Item
            name="expenseType"
            label="费用类型"
            rules={[{ required: true, message: "请选择费用类型" }]}
          >
            <Select options={[...EXPENSE_TYPE_OPTIONS]} placeholder="选择费用类型" />
          </Form.Item>

          <Form.Item name="gradeCode" label="职级" extra="留空表示不限职级，管所有人">
            <Input placeholder="例如 M2" allowClear />
          </Form.Item>

          <Form.Item name="cityTier" label="城市等级" extra="留空表示不限城市">
            <Select
              allowClear
              placeholder="不限城市"
              options={Object.entries(CITY_TIER_LABELS).map(([value, label]) => ({
                value,
                label
              }))}
            />
          </Form.Item>

          <Space align="start">
            <Form.Item
              name="limitYuan"
              label="限额（元）"
              rules={[{ required: true, message: "请填写限额" }]}
            >
              <InputNumber min={0} precision={2} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="limitBasis" label="计量基准">
              <Select
                style={{ width: 120 }}
                options={Object.entries(LIMIT_BASIS_LABELS).map(([value, label]) => ({
                  value,
                  label
                }))}
              />
            </Form.Item>
          </Space>

          <Form.Item name="overPolicy" label="超标时">
            <Select
              options={Object.entries(OVER_POLICY_META).map(([value, meta]) => ({
                value,
                label: `${meta.label}——${meta.hint}`
              }))}
            />
          </Form.Item>

          <Form.Item
            name="effectiveFrom"
            label="生效起日"
            rules={[{ required: true, message: "请选择生效起日" }]}
            extra="历史单据按当时的标准判定，所以改标准时是「停用旧的、新增一条」而不是改数字"
          >
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
