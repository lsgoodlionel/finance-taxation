/**
 * 往来账龄与逐笔核销（V12-C2 前端）。
 *
 * 账龄与逾期是两个口径，界面上分成两列而不是合并成一个"逾期金额"：
 * 账龄自发生日算（坏账准备的依据），逾期自发生日加信用账期算（违约判断）。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Modal, Radio, Select, Space, Statistic, Table, Tag, Typography } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { toast } from "sonner";
import {
  getAging,
  getSettlementOpenItems,
  settleEntries,
  type AgingBucketAmount,
  type AgingCounterpartyRow,
  type AgingItem,
  type SettlementCandidate
} from "../../lib/api";
import { errorMessage, todayIso } from "../../lib/errors";

type Direction = "receivable" | "payable";

export function AgingPanel() {
  const [direction, setDirection] = useState<Direction>("receivable");
  const [asOf] = useState(todayIso);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [buckets, setBuckets] = useState<AgingBucketAmount[]>([]);
  const [rows, setRows] = useState<AgingCounterpartyRow[]>([]);
  const [items, setItems] = useState<AgingItem[]>([]);
  const [total, setTotal] = useState("0.00");
  const [overdue, setOverdue] = useState("0.00");
  const [truncatedHint, setTruncatedHint] = useState<string | null>(null);

  const [settleOpen, setSettleOpen] = useState(false);
  const [openItems, setOpenItems] = useState<SettlementCandidate[]>([]);
  const [settleItems, setSettleItems] = useState<SettlementCandidate[]>([]);
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  const [settleEntryId, setSettleEntryId] = useState<string | null>(null);
  const [settling, setSettling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAging(direction, asOf);
      setBuckets(res.buckets);
      setRows(res.counterparties);
      setItems(res.items);
      setTotal(res.total);
      setOverdue(res.overdue);
      setTruncatedHint(res.truncatedHint);
    } catch (err) {
      const message = errorMessage(err, "加载账龄分析失败");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [direction, asOf]);

  useEffect(() => {
    void load();
  }, [load]);

  const openSettleDialog = useCallback(async () => {
    try {
      const res = await getSettlementOpenItems(direction, asOf);
      setOpenItems(res.openItems);
      setSettleItems(res.settleItems);
      setOpenEntryId(null);
      setSettleEntryId(null);
      setSettleOpen(true);
    } catch (err) {
      toast.error(errorMessage(err, "加载待核销明细失败"));
    }
  }, [direction, asOf]);

  const handleSettle = useCallback(async () => {
    if (!openEntryId || !settleEntryId) return;
    setSettling(true);
    try {
      const res = await settleEntries({ openEntryId, settleEntryId, settledOn: asOf });
      toast.success(`已核销 ${res.amount}；该笔欠款剩余 ${res.openRemaining}`);
      setSettleOpen(false);
      await load();
    } catch (err) {
      toast.error(errorMessage(err, "核销失败"));
    } finally {
      setSettling(false);
    }
  }, [openEntryId, settleEntryId, asOf, load]);

  const counterpartyColumns = useMemo(
    () => [
      { title: "往来单位", dataIndex: "counterpartyName" },
      { title: "笔数", dataIndex: "itemCount", align: "right" as const, width: 80 },
      { title: "余额合计", dataIndex: "total", align: "right" as const, width: 130 },
      {
        title: "其中已逾期",
        dataIndex: "overdue",
        align: "right" as const,
        width: 130,
        render: (value: string) =>
          Number(value) > 0 ? <Typography.Text type="danger">{value}</Typography.Text> : value
      },
      ...buckets.map((bucket) => ({
        title: bucket.label,
        dataIndex: ["buckets", bucket.key],
        align: "right" as const,
        width: 110,
        render: (_: unknown, row: AgingCounterpartyRow) => row.buckets[bucket.key] ?? "0.00"
      }))
    ],
    [buckets]
  );

  const directionLabel = direction === "receivable" ? "应收" : "应付";

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {error ? (
        <Alert
          type="error"
          showIcon
          message="加载账龄分析失败"
          description={error}
          action={<Button size="small" onClick={() => void load()}>重试</Button>}
        />
      ) : null}
      {truncatedHint ? <Alert type="warning" showIcon message={truncatedHint} /> : null}

      <Card style={{ borderRadius: 12 }}>
        <Space wrap style={{ width: "100%", justifyContent: "space-between" }}>
          <Space wrap>
            <Radio.Group
              value={direction}
              onChange={(e) => setDirection(e.target.value as Direction)}
              optionType="button"
              buttonStyle="solid"
              options={[
                { label: "应收账龄", value: "receivable" },
                { label: "应付账龄", value: "payable" }
              ]}
            />
            <Typography.Text type="secondary">截止 {asOf}</Typography.Text>
          </Space>
          <Space>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void load()}>
              刷新
            </Button>
            <Button type="primary" onClick={() => void openSettleDialog()}>
              逐笔核销
            </Button>
          </Space>
        </Space>

        <Space size={48} wrap style={{ marginTop: 20 }}>
          <Statistic title={`${directionLabel}余额合计`} value={total} />
          <Statistic
            title="其中已超信用账期"
            value={overdue}
            valueStyle={Number(overdue) > 0 ? { color: "#cf1322" } : undefined}
          />
        </Space>

        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
          账龄自业务发生日起算，是坏账准备的依据，与合同账期无关；「已超信用账期」按往来单位
          档案里的信用账期另算，用于判断对方是否违约。两个口径同表列示但不混算。
        </Typography.Paragraph>
      </Card>

      <Card title="分户账龄" style={{ borderRadius: 12 }}>
        <Table
          rowKey={(row) => row.counterpartyId ?? "__unassigned__"}
          size="small"
          loading={loading}
          dataSource={rows}
          columns={counterpartyColumns}
          scroll={{ x: "max-content" }}
          pagination={{ pageSize: 10, hideOnSinglePage: true }}
          locale={{ emptyText: `没有未结清的${directionLabel}款项。` }}
        />
      </Card>

      <Card title="逐笔明细" style={{ borderRadius: 12 }}>
        <Table
          rowKey="entryId"
          size="small"
          loading={loading}
          dataSource={items}
          scroll={{ x: "max-content" }}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          columns={[
            { title: "发生日期", dataIndex: "entryDate", width: 110 },
            { title: "往来单位", dataIndex: "counterpartyName", width: 160 },
            { title: "摘要", dataIndex: "summary" },
            { title: "科目", dataIndex: "accountCode", width: 90 },
            { title: "原始金额", dataIndex: "original", align: "right" as const, width: 120 },
            { title: "已核销", dataIndex: "settled", align: "right" as const, width: 110 },
            { title: "未结清", dataIndex: "open", align: "right" as const, width: 120 },
            { title: "账龄(天)", dataIndex: "agingDays", align: "right" as const, width: 90 },
            {
              title: "逾期(天)",
              dataIndex: "overdueDays",
              align: "right" as const,
              width: 90,
              render: (days: number) =>
                days > 0 ? <Tag color="red">{days}</Tag> : <Tag color="green">未逾期</Tag>
            }
          ]}
          locale={{ emptyText: `没有未结清的${directionLabel}明细。` }}
        />
      </Card>

      <Modal
        open={settleOpen}
        title="逐笔核销"
        okText="核销"
        okButtonProps={{ disabled: !openEntryId || !settleEntryId, loading: settling }}
        onOk={() => void handleSettle()}
        onCancel={() => setSettleOpen(false)}
        width={720}
        destroyOnClose
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="核销不产生凭证、不改动任何科目余额"
          description="债权债务在赊销与收款那两张凭证里已经入账；核销只是声明这笔收款抵的是那笔欠款。记错了撤销即可，账面数字一分不动。不填金额时按两侧可用余额的较小者全额核销。"
        />
        <div style={{ display: "grid", gap: 16 }}>
          <div>
            <Typography.Text strong>
              {direction === "receivable" ? "被核销的应收款项" : "被核销的应付款项"}
            </Typography.Text>
            <Select
              style={{ width: "100%", marginTop: 8 }}
              placeholder="选择一笔未结清的欠款"
              value={openEntryId}
              onChange={setOpenEntryId}
              options={openItems.map((item) => ({
                value: item.entryId,
                label: `${item.entryDate} ${item.counterpartyName} ${item.summary} 剩余 ${item.remaining}`
              }))}
            />
          </div>
          <div>
            <Typography.Text strong>
              {direction === "receivable" ? "收款分录" : "付款分录"}
            </Typography.Text>
            <Select
              style={{ width: "100%", marginTop: 8 }}
              placeholder="选择一笔尚有余额的收付款"
              value={settleEntryId}
              onChange={setSettleEntryId}
              options={settleItems.map((item) => ({
                value: item.entryId,
                label: `${item.entryDate} ${item.counterpartyName} ${item.summary} 可用 ${item.remaining}`
              }))}
            />
          </div>
          <Typography.Text type="secondary">
            往来单位必须一致，应收与应付不能互相核销——跨单位或跨口径核销会让两边的往来余额同时算错。
          </Typography.Text>
        </div>
      </Modal>
    </div>
  );
}
