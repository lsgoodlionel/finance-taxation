/**
 * 报销中心（V13-B8）。
 *
 * 两件事：**我的报销**与**填报销单**。
 *
 * ## 明细行的合计是当场算的
 *
 * 与服务端同一口径——那边也不存合计。表单上实时显示「本单合计」，
 * 让用户提交前就看到那个数，而不是提交后才发现与预期不符。
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Alert,
  Button,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { FileSearchOutlined, DeleteOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import type { Dayjs } from "dayjs";
import { toast } from "sonner";
import { PageHeader } from "../../components/ui/PageHeader";
import { TaskFocusShell } from "../../components/ui/TaskFocusShell";
import { errorMessage } from "../../lib/errors";
import { InvoicePicker } from "./InvoicePicker";
import { listCostCenters } from "../../lib/api";
import {
  auditReimbursement,
  createReimbursement,
  listAdvances,
  listReimbursements,
  transitionReimbursement,
  type AdvanceRow,
  type AuditOutcome,
  type ReimbursementLineInput,
  type ReimbursementRow
} from "../../lib/api-expense-control";
import { AuditPanel } from "./AuditPanel";
import { formatCents } from "../requests/request-view";
import { REIMBURSEMENT_STATUS_META, sumLineCents } from "./reimbursement-view";

const TASK_KEYS = ["mine", "create"] as const;
type ReimbursementTaskKey = (typeof TASK_KEYS)[number];

/** 费用类型与费用标准的 expense_type 同一套取值。 */
const EXPENSE_TYPES = [
  { value: "travel_hotel", label: "差旅-住宿" },
  { value: "travel_meal", label: "差旅-餐补" },
  { value: "travel_transport", label: "差旅-交通" },
  { value: "entertainment", label: "业务招待" },
  { value: "office", label: "办公用品" },
  { value: "communication", label: "通讯" },
  { value: "training", label: "培训" },
  { value: "other", label: "其他" }
];

interface DraftLine {
  key: number;
  expenseType: string;
  accountCode: string;
  amountYuan: number;
  quantity: number;
  summary: string;
  costCenterId?: string;
  /** 费用发生地城市等级。填了才能按「职级 × 城市」匹配到更具体的标准。 */
  cityTier?: string;
  /** V14-D：关联的发票。由用户从匹配建议里点选，系统不自动挂。 */
  invoiceId?: string;
  /** 选中发票的号码，仅用于显示——不回头查一次接口。 */
  invoiceNo?: string;
}

export function ReimbursementsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<ReimbursementRow[]>([]);
  const [advances, setAdvances] = useState<AdvanceRow[]>([]);
  const [costCenters, setCostCenters] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 审核结果按单据 id 缓存：切换任务、刷新列表都不该丢掉刚看到的结论。
  const [audits, setAudits] = useState<Record<string, AuditOutcome>>({});
  const [auditing, setAuditing] = useState<string | null>(null);

  // V14-D：正在给哪一行找发票。存 key 而不是整行——行的内容随时在改，
  // 存快照会让选中后写回一个过期的金额。
  const [pickingLineKey, setPickingLineKey] = useState<number | null>(null);
  const [expenseDate, setExpenseDate] = useState<Dayjs | null>(null);
  const [advanceId, setAdvanceId] = useState<string | undefined>(undefined);
  const [lines, setLines] = useState<DraftLine[]>([
    { key: 1, expenseType: "travel_hotel", accountCode: "660203", amountYuan: 0, quantity: 1, summary: "" }
  ]);

  const task: ReimbursementTaskKey =
    searchParams.get("task") === "create" ? "create" : "mine";

  const setTask = useCallback(
    (next: ReimbursementTaskKey) => {
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
      const [data, advanceData] = await Promise.all([
        listReimbursements({ mine: true }),
        listAdvances({ mine: true })
      ]);
      setItems(data.items);
      // 只有还欠着钱的借款才能冲销——已结清的挂上去没有意义。
      setAdvances(advanceData.items.filter((item) => item.outstandingCents > 0));
    } catch (error) {
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

  // 与服务端同一口径：合计由明细算，不存也不单独输入。
  const draftTotalCents = useMemo(
    () => lines.reduce((sum, line) => sum + Math.round((line.amountYuan || 0) * 100), 0),
    [lines]
  );

  const selectedAdvance = advances.find((item) => item.id === advanceId);

  const handleSubmit = async () => {
    if (!expenseDate) {
      toast.error("请选择费用发生日");
      return;
    }
    const payload: ReimbursementLineInput[] = lines
      .filter((line) => line.accountCode.trim() !== "")
      .map((line) => ({
        expenseType: line.expenseType,
        accountCode: line.accountCode.trim(),
        amountCents: Math.round((line.amountYuan || 0) * 100),
        quantity: line.quantity || 1,
        summary: line.summary,
        cityTier: line.cityTier ?? null,
        // V14-D：用户点选的发票。没选就是 null——不猜。
        invoiceId: line.invoiceId ?? null,
        // 单部门时用比例 100%，多部门分摊留给详情页做——一次填太多字段
        // 会让报销这件本该三十秒完成的事变成填表作业。
        allocationsByRatio: line.costCenterId
          ? [{ costCenterId: line.costCenterId, ratioBp: 10000 }]
          : undefined
      }));

    if (payload.length === 0) {
      toast.error("至少要有一行明细");
      return;
    }

    setSubmitting(true);
    try {
      const created = await createReimbursement({
        advanceId: advanceId ?? null,
        expenseDate: expenseDate.format("YYYY-MM-DD"),
        lines: payload
      });
      toast.success(`已保存 ${created.reimbursement.reimbursementNo}`);
      setLines([
        { key: 1, expenseType: "travel_hotel", accountCode: "660203", amountYuan: 0, quantity: 1, summary: "" }
      ]);
      setAdvanceId(undefined);
      setTask("mine");
      await reload();
    } catch (error) {
      toast.error(errorMessage(error, "保存失败"));
    } finally {
      setSubmitting(false);
    }
  };

  const runAudit = async (row: ReimbursementRow) => {
    setAuditing(row.id);
    try {
      const outcome = await auditReimbursement(row.id);
      setAudits((prev) => ({ ...prev, [row.id]: outcome }));
      return outcome;
    } catch (error) {
      toast.error(errorMessage(error, "审核失败"));
      return null;
    } finally {
      setAuditing(null);
    }
  };

  const handleTransition = async (row: ReimbursementRow, action: string) => {
    // 提交前先审核。**把结果展开给用户看，而不是让他撞一个 409**——
    // 服务端仍会拦（那是最终防线），但用户应当在点之前就知道哪里不行。
    if (action === "submit") {
      const outcome = await runAudit(row);
      if (outcome?.level === "block") {
        toast.error("有必须处理的合规问题，展开单据查看详情");
        return;
      }
    }

    try {
      const result = await transitionReimbursement(row.id, action);
      toast.success(result.note ?? "操作成功");
      await reload();
    } catch (error) {
      toast.error(errorMessage(error, "操作失败"));
    }
  };

  const columns: ColumnsType<ReimbursementRow> = [
    {
      title: "单据",
      dataIndex: "reimbursementNo",
      render: (value: string) => <Typography.Text code>{value}</Typography.Text>
    },
    { title: "费用日期", dataIndex: "expenseDate", width: 120 },
    {
      title: "明细",
      key: "lines",
      width: 90,
      render: (_, row) => `${row.lines.length} 行`
    },
    {
      title: "合计",
      dataIndex: "totalCents",
      align: "right",
      width: 130,
      render: (value: number) => <Typography.Text strong>{formatCents(value)}</Typography.Text>
    },
    {
      title: "冲借款",
      dataIndex: "advanceId",
      width: 90,
      render: (value: string | null) =>
        value ? <Tag color="blue">是</Tag> : <Typography.Text type="secondary">—</Typography.Text>
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (status: ReimbursementRow["status"]) => (
        <Tag color={REIMBURSEMENT_STATUS_META[status].color}>
          {REIMBURSEMENT_STATUS_META[status].label}
        </Tag>
      )
    },
    {
      title: "操作",
      key: "actions",
      width: 140,
      render: (_, row) =>
        row.status === "draft" ? (
          <Button size="small" type="primary" onClick={() => void handleTransition(row, "submit")}>
            提交审批
          </Button>
        ) : row.status === "rejected" ? (
          <Button size="small" onClick={() => void handleTransition(row, "submit")}>
            改后再提
          </Button>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        )
    }
  ];

  return (
    <div>
      <PageHeader
        title="报销中心"
        subtitle="合计由明细算出来；关联借款时贷方直接冲备用金，多退少补看余额"
        actions={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void reload()}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setTask("create")}>
              填报销单
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
        />
      )}

      <TaskFocusShell
        tasks={[
          { key: "mine", label: "我的报销", description: "提过的报销单走到哪一步了" },
          { key: "create", label: "填报销单", description: "一行一笔费用，可关联借款冲销" }
        ]}
        activeKey={task}
        onSelectTask={(key) => setTask(key as ReimbursementTaskKey)}
        switcherLabel="报销中心任务"
      >
        {task === "create" ? (
          <div>
            <Space wrap style={{ marginBottom: 16 }}>
              <Form layout="inline">
                <Form.Item label="费用发生日" required>
                  <DatePicker value={expenseDate} onChange={setExpenseDate} />
                </Form.Item>
                <Form.Item label="冲抵借款">
                  <Select
                    allowClear
                    style={{ width: 260 }}
                    placeholder="不冲借款（直接付给我）"
                    value={advanceId}
                    onChange={setAdvanceId}
                    options={advances.map((item) => ({
                      value: item.id,
                      label: `${item.advanceNo}（未还 ${formatCents(item.outstandingCents)}）`
                    }))}
                  />
                </Form.Item>
              </Form>
            </Space>

            {selectedAdvance && (
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message={`将冲抵 ${selectedAdvance.advanceNo}，当前未还 ${formatCents(selectedAdvance.outstandingCents)} 元`}
                description={
                  draftTotalCents > selectedAdvance.outstandingCents
                    ? `本单 ${formatCents(draftTotalCents)} 元超出未还金额，差额由公司补给你。`
                    : `本单 ${formatCents(draftTotalCents)} 元，冲抵后还需退回 ${formatCents(selectedAdvance.outstandingCents - draftTotalCents)} 元。`
                }
              />
            )}

            <Table<DraftLine>
              rowKey="key"
              size="small"
              pagination={false}
              dataSource={lines}
              columns={[
                {
                  title: "费用类型",
                  dataIndex: "expenseType",
                  width: 150,
                  render: (value: string, row) => (
                    <Select
                      size="small"
                      style={{ width: "100%" }}
                      value={value}
                      options={EXPENSE_TYPES}
                      onChange={(next) =>
                        setLines((prev) =>
                          prev.map((item) =>
                            item.key === row.key ? { ...item, expenseType: next } : item
                          )
                        )
                      }
                    />
                  )
                },
                {
                  title: "科目",
                  dataIndex: "accountCode",
                  width: 110,
                  render: (value: string, row) => (
                    <Input
                      size="small"
                      value={value}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((item) =>
                            item.key === row.key ? { ...item, accountCode: e.target.value } : item
                          )
                        )
                      }
                    />
                  )
                },
                {
                  title: "金额（元）",
                  dataIndex: "amountYuan",
                  width: 120,
                  render: (value: number, row) => (
                    <InputNumber
                      size="small"
                      min={0}
                      precision={2}
                      value={value}
                      onChange={(next) =>
                        setLines((prev) =>
                          prev.map((item) =>
                            item.key === row.key ? { ...item, amountYuan: next ?? 0 } : item
                          )
                        )
                      }
                    />
                  )
                },
                {
                  title: "数量",
                  dataIndex: "quantity",
                  width: 80,
                  render: (value: number, row) => (
                    <InputNumber
                      size="small"
                      min={1}
                      precision={0}
                      value={value}
                      onChange={(next) =>
                        setLines((prev) =>
                          prev.map((item) =>
                            item.key === row.key ? { ...item, quantity: next ?? 1 } : item
                          )
                        )
                      }
                    />
                  )
                },
                {
                  title: "城市",
                  dataIndex: "cityTier",
                  width: 110,
                  render: (value: string | undefined, row) => (
                    <Select
                      size="small"
                      allowClear
                      style={{ width: "100%" }}
                      placeholder="不限"
                      value={value}
                      options={[
                        { value: "tier1", label: "一线" },
                        { value: "tier2", label: "二线" },
                        { value: "tier3", label: "其他" }
                      ]}
                      onChange={(next) =>
                        setLines((prev) =>
                          prev.map((item) =>
                            item.key === row.key ? { ...item, cityTier: next } : item
                          )
                        )
                      }
                    />
                  )
                },
                {
                  title: "归属部门",
                  dataIndex: "costCenterId",
                  width: 140,
                  render: (value: string | undefined, row) => (
                    <Select
                      size="small"
                      allowClear
                      style={{ width: "100%" }}
                      placeholder="未指定"
                      value={value}
                      options={costCenters.map((item) => ({ value: item.id, label: item.name }))}
                      onChange={(next) =>
                        setLines((prev) =>
                          prev.map((item) =>
                            item.key === row.key ? { ...item, costCenterId: next } : item
                          )
                        )
                      }
                    />
                  )
                },
                {
                  title: "说明",
                  dataIndex: "summary",
                  render: (value: string, row) => (
                    <Input
                      size="small"
                      value={value}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((item) =>
                            item.key === row.key ? { ...item, summary: e.target.value } : item
                          )
                        )
                      }
                    />
                  )
                },
                {
                  // V14-D：只给建议，不自动挂。点开才去查候选——
                  // 每行都自动查会在建单时打出几十次请求，而多数行用不上。
                  title: "发票",
                  key: "invoice",
                  width: 130,
                  render: (_, row) =>
                    row.invoiceId ? (
                      <Space size={2}>
                        <Typography.Text code style={{ fontSize: 12 }}>
                          {row.invoiceNo}
                        </Typography.Text>
                        <Button
                          size="small"
                          type="text"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() =>
                            setLines((prev) =>
                              prev.map((item) =>
                                item.key === row.key
                                  ? { ...item, invoiceId: undefined, invoiceNo: undefined }
                                  : item
                              )
                            )
                          }
                        />
                      </Space>
                    ) : (
                      <Button
                        size="small"
                        icon={<FileSearchOutlined />}
                        disabled={!expenseDate || (row.amountYuan || 0) <= 0}
                        onClick={() => setPickingLineKey(row.key)}
                      >
                        找发票
                      </Button>
                    )
                },
                {
                  title: "",
                  key: "remove",
                  width: 50,
                  render: (_, row) => (
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      disabled={lines.length === 1}
                      onClick={() => setLines((prev) => prev.filter((item) => item.key !== row.key))}
                    />
                  )
                }
              ]}
              footer={() => (
                <Space style={{ width: "100%", justifyContent: "space-between" }}>
                  <Button
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() =>
                      setLines((prev) => [
                        ...prev,
                        {
                          key: Math.max(...prev.map((item) => item.key)) + 1,
                          expenseType: "other",
                          accountCode: "660203",
                          amountYuan: 0,
                          quantity: 1,
                          summary: ""
                        }
                      ])
                    }
                  >
                    加一行
                  </Button>
                  <Typography.Text strong>
                    本单合计 {formatCents(draftTotalCents)} 元
                  </Typography.Text>
                </Space>
              )}
            />

            <Space style={{ marginTop: 16 }}>
              <Button type="primary" loading={submitting} onClick={() => void handleSubmit()}>
                保存为草稿
              </Button>
            </Space>
          </div>
        ) : loading ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : items.length === 0 && !loadError ? (
          <Empty description="还没有报销单">
            <Button type="primary" onClick={() => setTask("create")}>
              填第一张报销单
            </Button>
          </Empty>
        ) : (
          <Table<ReimbursementRow>
            rowKey="id"
            size="small"
            dataSource={items}
            columns={columns}
            pagination={false}
            expandable={{
              // 展开时自动审核一次：用户展开单据就是想知道「这单有没有问题」。
              onExpand: (expanded, row) => {
                if (expanded && !audits[row.id]) void runAudit(row);
              },
              expandedRowRender: (row) => (
                <div>
                  {audits[row.id] ? (
                    <div style={{ marginBottom: 12 }}>
                      <AuditPanel
                        outcome={audits[row.id]!}
                        lineLabels={Object.fromEntries(
                          row.lines.map((line) => [line.id, line.summary || line.expenseType])
                        )}
                      />
                    </div>
                  ) : auditing === row.id ? (
                    <Skeleton active paragraph={{ rows: 1 }} style={{ marginBottom: 12 }} />
                  ) : null}
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={row.lines}
                  columns={[
                    { title: "费用类型", dataIndex: "expenseType", width: 140 },
                    { title: "科目", dataIndex: "accountCode", width: 100 },
                    {
                      title: "金额",
                      dataIndex: "amountCents",
                      align: "right",
                      width: 110,
                      render: (value: number) => formatCents(value)
                    },
                    {
                      title: "分摊",
                      key: "allocations",
                      render: (_, line) =>
                        line.allocations.length === 0 ? (
                          <Typography.Text type="secondary">未指定部门</Typography.Text>
                        ) : (
                          line.allocations
                            .map(
                              (item) =>
                                `${item.costCenterId} ${(item.ratioBp / 100).toFixed(0)}%（${formatCents(item.amountCents)}）`
                            )
                            .join("，")
                        )
                    },
                    { title: "说明", dataIndex: "summary" }
                  ]}
                />
                </div>
              )
            }}
          />
        )}
      </TaskFocusShell>

      {/* V14-D：发票匹配建议。**系统不替用户选**——只按相关度排序，
          用户点一下选中。误挂一张票要到对账时才发现。 */}
      {pickingLineKey !== null && (() => {
        const line = lines.find((item) => item.key === pickingLineKey);
        if (!line || !expenseDate) return null;
        return (
          <InvoicePicker
            open
            amountCents={Math.round((line.amountYuan || 0) * 100)}
            expenseOn={expenseDate.format("YYYY-MM-DD")}
            keyword={line.summary}
            onPick={(invoiceId, invoiceNo) => {
              setLines((prev) =>
                prev.map((item) =>
                  item.key === pickingLineKey ? { ...item, invoiceId, invoiceNo } : item
                )
              );
              setPickingLineKey(null);
            }}
            onClose={() => setPickingLineKey(null)}
          />
        );
      })()}
    </div>
  );
}
