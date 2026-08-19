/**
 * 付款中心（V13-C7）。
 *
 * 两件事：**本月应付**与**付款记录**。
 *
 * ## 应付列表是出纳每天的第一屏
 *
 * 所以它排在第一，且默认就是本月。按对方分组的合计放在最上面——出纳的
 * 实际操作是「今天给这家转一笔」，而不是逐期转。
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Alert,
  Button,
  DatePicker,
  Empty,
  InputNumber,
  Modal,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tag,
  Typography
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { toast } from "sonner";
import { Term } from "../../components/ui/Term";
import { PageHeader } from "../../components/ui/PageHeader";
import { TaskFocusShell } from "../../components/ui/TaskFocusShell";
import { errorMessage } from "../../lib/errors";
import {
  confirmPayment,
  createPayment,
  getScheduleThreeWay,
  listDuePayments,
  listPayments,
  type AuditFinding,
  type ControlLevel,
  type DuePaymentRow,
  type PaymentRow
} from "../../lib/api-expense-control";
import {
  PAYMENT_STATUS_META,
  formatCents,
  groupDueByCounterparty,
  remainingCents
} from "./payment-view";

const TASK_KEYS = ["due", "records"] as const;
type PaymentTaskKey = (typeof TASK_KEYS)[number];

export function PaymentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [due, setDue] = useState<DuePaymentRow[]>([]);
  const [dueTotalCents, setDueTotalCents] = useState(0);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [paying, setPaying] = useState<DuePaymentRow | null>(null);
  const [payAmountYuan, setPayAmountYuan] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  // 三单匹配结果（V13 缺口 13）。付款前跑一次，把差异摆给出纳看——
  // **不阻断付款**：预付款、先票后货都是正当安排，拦死会让正常业务卡住。
  const [threeWay, setThreeWay] = useState<{ level: ControlLevel; findings: AuditFinding[] } | null>(
    null
  );
  const [matching, setMatching] = useState(false);

  const task: PaymentTaskKey = searchParams.get("task") === "records" ? "records" : "due";
  const month = searchParams.get("month") ?? dayjs().format("YYYY-MM");

  const setTask = useCallback(
    (next: PaymentTaskKey) => {
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
      const from = `${month}-01`;
      const to = dayjs(from).endOf("month").format("YYYY-MM-DD");
      const [dueData, paymentData] = await Promise.all([
        listDuePayments({ from, to }),
        listPayments({ from, to })
      ]);
      setDue(dueData.items);
      setDueTotalCents(dueData.totalCents);
      setPayments(paymentData.items);
    } catch (error) {
      // 不静默：应付列表加载失败显示成空，出纳会以为这个月没有要付的。
      setLoadError(errorMessage(error, "加载失败，请重试"));
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const grouped = useMemo(() => groupDueByCounterparty(due), [due]);

  const handlePay = async () => {
    if (!paying) return;
    setSubmitting(true);
    try {
      const created = await createPayment({
        scheduleId: paying.scheduleId,
        amountCents: Math.round(payAmountYuan * 100),
        paidOn: dayjs().format("YYYY-MM-DD")
      });
      // 建单后立刻确认：出纳点「付款」的语义就是钱已经转出去了，
      // 让他再点一次「确认」是多余的一步。凭证仍是草稿，等会计过账。
      const confirmed = await confirmPayment(created.payment.id);
      toast.success(confirmed.note);
      setPaying(null);
      await reload();
    } catch (error) {
      toast.error(errorMessage(error, "付款失败"));
    } finally {
      setSubmitting(false);
    }
  };

  const dueColumns: ColumnsType<DuePaymentRow> = [
    { title: "对方", dataIndex: "counterpartyName", width: 150, ellipsis: true },
    {
      title: "合同",
      key: "contract",
      render: (_, row) => (
        <span>
          <Typography.Text code>{row.contractNo}</Typography.Text>
          <Typography.Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
            第 {row.periodNo} 期 {row.title}
          </Typography.Text>
        </span>
      )
    },
    {
      title: "类型",
      dataIndex: "scheduleType",
      width: 90,
      render: (value: string) =>
        value === "retention" ? <Tag color="purple">质保金</Tag> : <Tag>常规</Tag>
    },
    { title: "到期日", dataIndex: "dueDate", width: 120 },
    {
      title: "期次金额",
      dataIndex: "amountCents",
      align: "right",
      width: 120,
      render: (value: number) => formatCents(value)
    },
    {
      title: "还需付",
      key: "remaining",
      align: "right",
      width: 120,
      // 剩余而不是期次金额——已付一部分的期次只该显示还差的那部分，
      // 否则出纳会按全额再付一遍。
      render: (_, row) => (
        <Typography.Text strong>{formatCents(remainingCents(row))}</Typography.Text>
      )
    },
    {
      title: "操作",
      key: "actions",
      width: 100,
      render: (_, row) => (
        <Button
          size="small"
          type="primary"
          onClick={() => {
            const amount = remainingCents(row);
            setPayAmountYuan(amount / 100);
            setPaying(row);
            // 打开弹窗就跑一次匹配——出纳要在点确认之前看到差异，
            // 而不是付完款才知道验收还没做。
            setThreeWay(null);
            setMatching(true);
            getScheduleThreeWay(row.scheduleId, amount)
              .then((result) => setThreeWay(result))
              .catch(() => setThreeWay(null))
              .finally(() => setMatching(false));
          }}
        >
          付款
        </Button>
      )
    }
  ];

  const paymentColumns: ColumnsType<PaymentRow> = [
    {
      title: "付款单号",
      dataIndex: "paymentNo",
      render: (value: string) => <Typography.Text code>{value}</Typography.Text>
    },
    { title: "付款日", dataIndex: "paidOn", width: 120 },
    {
      title: "金额",
      dataIndex: "amountCents",
      align: "right",
      width: 130,
      render: (value: number) => <Typography.Text strong>{formatCents(value)}</Typography.Text>
    },
    { title: "付款账户", dataIndex: "bankAccountCode", width: 110 },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (status: PaymentRow["status"]) => (
        <Tag color={PAYMENT_STATUS_META[status].color}>{PAYMENT_STATUS_META[status].label}</Tag>
      )
    },
    {
      title: "记账凭证",
      dataIndex: "voucherId",
      width: 110,
      render: (value: string | null) =>
        value ? (
          <Tag color="blue">
            草稿待<Term k="posting">过账</Term>
          </Tag>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        )
    },
    {
      title: "导出批次",
      dataIndex: "exportBatchNo",
      render: (value: string | null) =>
        value ?? <Typography.Text type="secondary">未导出</Typography.Text>
    }
  ];

  return (
    <div>
      <PageHeader
        title="付款中心"
        subtitle="应付按到期日排；已付清的期次不会出现在这里，避免重复付款"
        actions={
          <Space>
            <DatePicker
              picker="month"
              value={dayjs(month, "YYYY-MM")}
              onChange={(value) => {
                const params = new URLSearchParams(searchParams);
                if (value) params.set("month", value.format("YYYY-MM"));
                setSearchParams(params, { replace: true });
              }}
              allowClear={false}
            />
            <Button icon={<ReloadOutlined />} onClick={() => void reload()}>
              刷新
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

      <TaskFocusShell
        tasks={[
          { key: "due", label: "本月应付", description: "到期未付清的合同期次", badge: due.length || undefined },
          { key: "records", label: "付款记录", description: "已建的付款单与凭证状态" }
        ]}
        activeKey={task}
        onSelectTask={(key) => setTask(key as PaymentTaskKey)}
        switcherLabel="付款中心任务"
      >
        {task === "due" ? (
          loading ? (
            <Skeleton active paragraph={{ rows: 4 }} />
          ) : due.length === 0 && !loadError ? (
            <Empty description={`${month} 没有到期未付的款项`} />
          ) : (
            <div>
              <Space size="large" wrap style={{ marginBottom: 16 }}>
                <Statistic title="本月应付合计" value={dueTotalCents / 100} precision={2} suffix="元" />
                <Statistic title="待付期次" value={due.length} suffix="笔" />
              </Space>

              {grouped.length > 1 && (
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message="按对方合计"
                  description={grouped
                    .map(
                      (item) =>
                        `${item.counterpartyName} ${formatCents(item.totalCents)} 元（${item.count} 笔）`
                    )
                    .join("；")}
                />
              )}

              <Table<DuePaymentRow>
                rowKey="scheduleId"
                size="small"
                dataSource={due}
                columns={dueColumns}
                pagination={false}
              />
            </div>
          )
        ) : loading ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : payments.length === 0 ? (
          <Empty description={`${month} 没有付款记录`} />
        ) : (
          <Table<PaymentRow>
            rowKey="id"
            size="small"
            dataSource={payments}
            columns={paymentColumns}
            pagination={false}
          />
        )}
      </TaskFocusShell>

      <Modal
        open={paying !== null}
        title={paying ? `付款：${paying.contractNo} 第 ${paying.periodNo} 期` : ""}
        okText="确认付款"
        cancelText="取消"
        confirmLoading={submitting}
        onCancel={() => setPaying(null)}
        onOk={() => void handlePay()}
      >
        {paying && (
          <div>
            <Typography.Paragraph>
              对方：{paying.counterpartyName}
              <br />
              还需付：<strong>{formatCents(remainingCents(paying))} 元</strong>
            </Typography.Paragraph>
            <Space>
              <span>本次付款（元）</span>
              <InputNumber
                min={0.01}
                max={remainingCents(paying) / 100}
                precision={2}
                value={payAmountYuan}
                onChange={(value) => setPayAmountYuan(value ?? 0)}
              />
            </Space>
            {matching ? (
              <Skeleton active paragraph={{ rows: 1 }} style={{ marginTop: 12 }} />
            ) : threeWay && threeWay.findings.length > 0 ? (
              <Alert
                type="warning"
                showIcon
                style={{ marginTop: 12 }}
                message="三单匹配提示"
                description={
                  <div>
                    {threeWay.findings.map((finding) => (
                      <div key={finding.code}>· {finding.message}</div>
                    ))}
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      这些不阻断付款——预付款、先票后货都是正当安排。确认无误即可继续。
                    </Typography.Text>
                  </div>
                }
              />
            ) : null}

            <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
              付款会生成一张<strong><Term k="voucher">凭证</Term>草稿</strong>，
              需会计复核后<Term k="posting">过账</Term>。
              超过未付余额的金额会被拒绝——超付事前拦比事后红冲便宜。
            </Typography.Paragraph>
          </div>
        )}
      </Modal>
    </div>
  );
}
