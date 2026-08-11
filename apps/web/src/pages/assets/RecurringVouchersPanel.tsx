/**
 * 定期凭证模板（V12-C4 前端）。
 *
 * 生成的是草稿凭证：房租这个月要不要提、金额有没有随合同调整，模板不知道。
 */
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, Form, Input, InputNumber, Modal, Space, Table, Tag, Typography } from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { Term } from "../../components/ui/Term";
import { toast } from "sonner";
import { usePeriod } from "../../lib/period-context";
import {
  createRecurringVoucher,
  generateRecurringVouchers,
  listRecurringVouchers,
  setRecurringVoucherStatus,
  type RecurringVoucherView
} from "../../lib/api";

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

const SKIP_REASONS: Record<string, string> = {
  out_of_scope: "不在有效期间内或已暂停",
  already_generated: "本期已生成过"
};

export function RecurringVouchersPanel() {
  const { period } = usePeriod();
  const [items, setItems] = useState<RecurringVoucherView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listRecurringVouchers();
      setItems(res.items);
    } catch (err) {
      const message = errorMessage(err, "加载定期凭证模板失败");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await generateRecurringVouchers(period);
      if (res.generated.length > 0) {
        toast.success(`已为 ${period} 生成 ${res.generated.length} 张草稿凭证，待审核过账`);
      } else {
        // 按了按钮却什么都没发生是最让人困惑的反馈——把原因说出来
        const reasons = res.skipped
          .map((item) => `${item.name}：${SKIP_REASONS[item.skippedReason ?? ""] ?? "已跳过"}`)
          .join("；");
        toast.info(reasons || `${period} 没有到期的定期凭证模板`);
      }
    } catch (err) {
      toast.error(errorMessage(err, "生成定期凭证失败"));
    } finally {
      setGenerating(false);
    }
  }, [period]);

  const handleToggle = useCallback(
    async (row: RecurringVoucherView) => {
      const next = row.status === "active" ? "paused" : "active";
      try {
        await setRecurringVoucherStatus(row.id, next);
        toast.success(next === "paused" ? `已暂停「${row.name}」` : `已恢复「${row.name}」`);
        await load();
      } catch (err) {
        toast.error(errorMessage(err, "更新状态失败"));
      }
    },
    [load]
  );

  const handleCreate = useCallback(async () => {
    try {
      const values = await form.validateFields();
      await createRecurringVoucher({
        name: values.name,
        startPeriod: values.startPeriod,
        endPeriod: values.endPeriod || null,
        summaryTemplate: values.summaryTemplate,
        lines: [
          {
            accountCode: values.debitAccountCode,
            debit: String(values.amount),
            credit: "0"
          },
          {
            accountCode: values.creditAccountCode,
            debit: "0",
            credit: String(values.amount)
          }
        ]
      });
      toast.success("定期凭证模板已建立");
      setCreateOpen(false);
      form.resetFields();
      await load();
    } catch (err) {
      if (err && typeof err === "object" && "errorFields" in err) return;
      toast.error(errorMessage(err, "建立模板失败"));
    }
  }, [form, load]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {error ? (
        <Alert
          type="error"
          showIcon
          message="加载定期凭证模板失败"
          description={error}
          action={<Button size="small" onClick={() => void load()}>重试</Button>}
        />
      ) : null}

      <Card
        title={`定期凭证模板 · 当前期间 ${period}`}
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} loading={generating} onClick={() => void handleGenerate()}>
              生成本期草稿
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
              新建模板
            </Button>
          </Space>
        }
        style={{ borderRadius: 12 }}
      >
        <Typography.Paragraph type="secondary">
          每月固定发生的<Term k="voucher">凭证</Term>（房租、<Term k="amortization">摊销</Term>、
          固定服务费）建成模板后，每期一键生成草稿，省掉重复录入。生成的是草稿，仍需审核
          <Term k="posting">过账</Term>才进<Term k="general-ledger">总账</Term>。
          重复生成不会产生第二张凭证。
        </Typography.Paragraph>
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={items}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          expandable={{
            expandedRowRender: (row) => (
              <Table
                rowKey={(line) => `${row.id}-${line.accountCode}-${line.debit}-${line.credit}`}
                size="small"
                pagination={false}
                dataSource={row.lines}
                columns={[
                  { title: "科目", dataIndex: "accountCode", width: 110 },
                  { title: "科目名称", dataIndex: "accountName" },
                  { title: "借方", dataIndex: "debit", align: "right" as const, width: 120 },
                  { title: "贷方", dataIndex: "credit", align: "right" as const, width: 120 }
                ]}
              />
            )
          }}
          columns={[
            { title: "模板名称", dataIndex: "name" },
            { title: "摘要模板", dataIndex: "summaryTemplate" },
            { title: "开始期间", dataIndex: "startPeriod", width: 110 },
            {
              title: "结束期间",
              dataIndex: "endPeriod",
              width: 110,
              render: (value: string | null) => value ?? "无限期"
            },
            {
              title: "状态",
              dataIndex: "status",
              width: 90,
              render: (status: string) =>
                status === "active" ? <Tag color="green">启用</Tag> : <Tag>已暂停</Tag>
            },
            {
              title: "操作",
              width: 90,
              render: (_: unknown, row: RecurringVoucherView) => (
                <Button size="small" onClick={() => void handleToggle(row)}>
                  {row.status === "active" ? "暂停" : "恢复"}
                </Button>
              )
            }
          ]}
          locale={{ emptyText: "还没有定期凭证模板。" }}
        />
      </Card>

      <Modal
        open={createOpen}
        title="新建定期凭证模板"
        okText="建立"
        onOk={() => void handleCreate()}
        onCancel={() => setCreateOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="name" label="模板名称" rules={[{ required: true, message: "请填写模板名称" }]}>
            <Input placeholder="办公室房租" />
          </Form.Item>
          <Form.Item
            name="summaryTemplate"
            label="摘要模板"
            initialValue="计提办公室房租 {period}"
            rules={[{ required: true, message: "请填写摘要模板" }]}
            extra="{period} 会被替换成实际期间，如 2026-06。"
          >
            <Input />
          </Form.Item>
          <Form.Item
            name="startPeriod"
            label="开始期间"
            rules={[{ required: true, pattern: /^\d{4}-\d{2}$/, message: "格式 YYYY-MM" }]}
          >
            <Input placeholder="2026-01" />
          </Form.Item>
          <Form.Item
            name="endPeriod"
            label="结束期间"
            rules={[{ pattern: /^\d{4}-\d{2}$/, message: "格式 YYYY-MM" }]}
            extra="留空表示无限期，如长期租赁。"
          >
            <Input placeholder="2026-12" />
          </Form.Item>
          <Form.Item name="amount" label="金额" rules={[{ required: true, message: "请填写金额" }]}>
            <InputNumber style={{ width: "100%" }} min={0.01} precision={2} />
          </Form.Item>
          <Form.Item
            name="debitAccountCode"
            label="借方科目"
            rules={[{ required: true, message: "请填写借方科目" }]}
          >
            <Input placeholder="6301e03" />
          </Form.Item>
          <Form.Item
            name="creditAccountCode"
            label="贷方科目"
            rules={[{ required: true, message: "请填写贷方科目" }]}
          >
            <Input placeholder="2202" />
          </Form.Item>
          <Typography.Text type="secondary">
            当前只支持一借一贷的等额模板。模板本身必须<Term k="debit-credit-balance">借贷平衡</Term>
            ——不平的模板会每个月生成一张过不了账的草稿，因此在这一刻就会被拒绝。
          </Typography.Text>
        </Form>
      </Modal>
    </div>
  );
}
