/**
 * 付款单的银企直连面板（V14-A）。
 *
 * ## 为什么是抽屉而不是直接一个按钮
 *
 * 「发往银行」不是一次点击就结束的动作：提交之后有受理、处理中、成功、失败
 * 几种状态，而且可能提交过不止一次（首次超时后重发）。把这些摆在一个抽屉里，
 * 出纳能看清「这笔到底发出去几次、银行现在怎么说」。
 *
 * ## 提交不改付款单状态
 *
 * 银行说「已受理」不等于钱到账。付款单仍由出纳自己确认后标记已付——
 * 把两者串成自动流程，等于让适配器直接改账。
 */

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Empty,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { ReloadOutlined, SendOutlined } from "@ant-design/icons";
import { toast } from "sonner";
import { errorMessage } from "../../lib/errors";
import { Explain } from "../../components/ui/Explain";
import {
  listBankConnectConfigs,
  listBankInstructions,
  refreshBankInstruction,
  submitBankInstruction,
  type BankConnectConfig,
  type BankInstructionStatus,
  type BankTransferInstruction
} from "../../lib/api-bank-connect";
import { formatCents } from "./payment-view";

/**
 * 状态的呈现。
 *
 * **「处理中」既不是成功也不是失败，`unknown` 也不是失败**——
 * 把它们都染成红色会让出纳以为付失败了，于是再发一笔。
 */
const STATUS_META: Record<BankInstructionStatus, { label: string; color: string }> = {
  pending: { label: "待提交", color: "default" },
  accepted: { label: "银行已受理", color: "processing" },
  processing: { label: "处理中", color: "processing" },
  succeeded: { label: "付款成功", color: "success" },
  failed: { label: "付款失败", color: "error" },
  unknown: { label: "状态未知", color: "warning" }
};

export interface BankInstructionPanelProps {
  paymentId: string | null;
  paymentNo: string;
  /** 付款单状态。只有 submitted 能发往银行。 */
  paymentStatus: string;
  onClose: () => void;
}

export function BankInstructionPanel({
  paymentId,
  paymentNo,
  paymentStatus,
  onClose
}: BankInstructionPanelProps) {
  const [items, setItems] = useState<BankTransferInstruction[]>([]);
  const [configs, setConfigs] = useState<BankConnectConfig[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (paymentId === null) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [instructionData, configData] = await Promise.all([
        listBankInstructions({ paymentId }),
        listBankConnectConfigs()
      ]);
      setItems(instructionData.items);
      // 只有启用且适配器已接入的账号能选。列出选不了的选项，
      // 点下去才报错，那是把配置问题伪装成操作问题。
      const usable = configData.items.filter((item) => item.enabled && item.isProviderAvailable);
      setConfigs(usable);
      setSelectedConfigId((prev) => prev ?? usable[0]?.id);
    } catch (error) {
      setLoadError(errorMessage(error, "银企指令加载失败"));
    } finally {
      setLoading(false);
    }
  }, [paymentId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleSubmit = async () => {
    if (paymentId === null || selectedConfigId === undefined) return;
    setSubmitting(true);
    try {
      const result = await submitBankInstruction({ paymentId, configId: selectedConfigId });
      toast.success(`已提交，银行${STATUS_META[result.instruction.status].label}`);
      await reload();
    } catch (error) {
      toast.error(errorMessage(error, "提交失败"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefresh = async (row: BankTransferInstruction) => {
    setRefreshingId(row.id);
    try {
      await refreshBankInstruction(row.id);
      await reload();
    } catch (error) {
      toast.error(errorMessage(error, "状态查询失败"));
    } finally {
      setRefreshingId(null);
    }
  };

  const columns: ColumnsType<BankTransferInstruction> = [
    {
      title: "我方流水号",
      dataIndex: "clientRef",
      render: (value: string) => <Typography.Text code>{value}</Typography.Text>
    },
    {
      title: "银行流水号",
      dataIndex: "bankRef",
      render: (value: string | null) =>
        value ?? <Typography.Text type="secondary">—</Typography.Text>
    },
    {
      title: "金额",
      dataIndex: "amountCents",
      align: "right",
      width: 110,
      render: (value: number) => formatCents(value)
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 110,
      render: (status: BankInstructionStatus) => (
        <Tag color={STATUS_META[status].color}>{STATUS_META[status].label}</Tag>
      )
    },
    {
      title: "银行回复",
      dataIndex: "message",
      ellipsis: true,
      render: (value: string | null) =>
        value ?? <Typography.Text type="secondary">—</Typography.Text>
    },
    {
      title: "操作",
      key: "actions",
      width: 90,
      render: (_: unknown, row: BankTransferInstruction) => {
        // 终态不再提供查询：银行不会把已完成的改回去，反复查只是浪费限额。
        if (row.status === "succeeded" || row.status === "failed") {
          return <Typography.Text type="secondary">—</Typography.Text>;
        }
        return (
          <Button
            size="small"
            icon={<ReloadOutlined />}
            loading={refreshingId === row.id}
            onClick={() => void handleRefresh(row)}
          >
            查状态
          </Button>
        );
      }
    }
  ];

  const canSubmit = paymentStatus === "submitted" && configs.length > 0;

  return (
    <Drawer
      open={paymentId !== null}
      onClose={onClose}
      width={860}
      title={`银企直连：${paymentNo}`}
      destroyOnClose
    >
      {loadError && <Alert type="error" showIcon message={loadError} style={{ marginBottom: 12 }} />}

      {loading ? (
        <Skeleton active paragraph={{ rows: 3 }} />
      ) : (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Explain title="提交给银行不会改动付款单状态" storageKey="bank-instruction.no-auto-status">
            银行说「已受理」不等于钱到账。核对银行流水后，仍由出纳自己把付款单标记为已付。
          </Explain>

          {configs.length === 0 ? (
            <Alert
              type="warning"
              showIcon
              message="没有可用的银企账号"
              description="需要在「系统设置 → 银企直连」里添加付款账号，启用它，并且该银行的适配器已接入。"
            />
          ) : (
            <Descriptions size="small" column={1} bordered>
              <Descriptions.Item label="从哪个账号付">
                <Space>
                  <Select
                    style={{ width: 320 }}
                    value={selectedConfigId}
                    onChange={setSelectedConfigId}
                    options={configs.map((item) => ({
                      value: item.id,
                      label: `${item.displayName}（${item.payerAccount}）`
                    }))}
                  />
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    loading={submitting}
                    disabled={!canSubmit}
                    onClick={() => void handleSubmit()}
                  >
                    发往银行
                  </Button>
                  {paymentStatus !== "submitted" && (
                    <Typography.Text type="secondary">
                      付款单当前为「{paymentStatus}」，只有已提交的能发往银行
                    </Typography.Text>
                  )}
                </Space>
              </Descriptions.Item>
            </Descriptions>
          )}

          {items.length === 0 ? (
            <Empty description="这张付款单还没发往银行" />
          ) : (
            <Table<BankTransferInstruction>
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={items}
              columns={columns}
            />
          )}
        </Space>
      )}
    </Drawer>
  );
}
