/**
 * 成本结转（V14-C）。
 *
 * ## 页面要回答的问题
 *
 * 「这个月归集的料工费，多少跟着完工产品走了、多少留在车间里没做完。」
 *
 * 约当产量法是这个问题的标准答案，但它的结果光看数字看不出对不对——
 * 所以这一屏把**三项的完工程度**摆在最显眼的地方：材料 100%、人工与
 * 制造费用按加工进度。用同一个进度分三项是这里最常见的错，而它的后果
 * （完工成本被高估、在产品余额撑不起车间里的料）要到毛利异常时才有人发现。
 *
 * ## 结转前必须先预演
 *
 * 预演与实际结转走**同一个纯函数**，所以看到的数字就是要落账的数字。
 * 分两套算法实现是「预览说 80 万、实际结转 88 万」的来源。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Empty,
  Modal,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tag,
  Typography
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { CalculatorOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { toast } from "sonner";
import { PageHeader } from "../../components/ui/PageHeader";
import { Term } from "../../components/ui/Term";
import { Explain } from "../../components/ui/Explain";
import { useColumnPreset } from "../../components/ui/useColumnPreset";
import { errorMessage } from "../../lib/errors";
import { ProductionRunForm } from "./ProductionRunForm";
import {
  carryOverProductionRun,
  listProductionRuns,
  previewProductionRun,
  COST_ELEMENT_LABELS,
  type Allocation,
  type ProductionRun,
  type ProductionRunStatus,
  type RunCost
} from "../../lib/api-cost";

const STATUS_META: Record<ProductionRunStatus, { label: string; color: string }> = {
  draft: { label: "待结转", color: "warning" },
  carried_over: { label: "已结转", color: "success" },
  cancelled: { label: "已作废", color: "default" }
};

const TOTAL_BASIS_POINTS = 10000;

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function CostCarryoverPage() {
  const [runs, setRuns] = useState<ProductionRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<ProductionRun | null>(null);
  const [allocation, setAllocation] = useState<Allocation | null>(null);
  const [allocationError, setAllocationError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [carrying, setCarrying] = useState(false);
  const [accountingDate, setAccountingDate] = useState(dayjs());
  // V14-C：录入本期生产。没有这个入口的话，后端能建批次而页面上建不了——
  // 「后端有能力、没入口」在这个项目里已经出现七次。
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await listProductionRuns();
      setRuns(data.items);
    } catch (error) {
      // 不静默：加载失败显示成空会被读成「这个月没有生产」，
      // 于是没人去结转，成本一直挂在生产成本上。
      setLoadError(errorMessage(error, "生产批次加载失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openPreview = async (run: ProductionRun) => {
    setPreviewing(run);
    setAllocation(null);
    setAllocationError(null);
    setPreviewLoading(true);
    setAccountingDate(dayjs(`${run.period}-01`).endOf("month"));
    try {
      const data = await previewProductionRun(run.id);
      setAllocation(data.allocation);
    } catch (error) {
      // 「归集了成本却没有任何产出」这类是真问题，摆出来让人去补产量数据。
      setAllocationError(errorMessage(error, "试算失败"));
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleCarryOver = async () => {
    if (!previewing) return;
    setCarrying(true);
    try {
      const result = await carryOverProductionRun(
        previewing.id,
        accountingDate.format("YYYY-MM-DD")
      );
      toast.success(
        `已结转 ${formatCents(result.totalFinishedCents)} 元，凭证草稿已生成，待复核过账`
      );
      setPreviewing(null);
      await reload();
    } catch (error) {
      toast.error(errorMessage(error, "结转失败"));
    } finally {
      setCarrying(false);
    }
  };

  const pendingCount = useMemo(
    () => runs.filter((run) => run.status === "draft").length,
    [runs]
  );

  const columns: ColumnsType<ProductionRun> = [
    { title: "期间", key: "period", dataIndex: "period", width: 100 },
    {
      title: "产品",
      key: "product",
      render: (_, row) => (
        <Space size={4}>
          <Typography.Text code>{row.productCode}</Typography.Text>
          <span>{row.productName}</span>
        </Space>
      )
    },
    {
      title: "完工",
      key: "finishedQuantity",
      dataIndex: "finishedQuantity",
      align: "right",
      width: 90,
      render: (value: number, row) => `${value} ${row.productUnit}`
    },
    {
      title: "在产",
      key: "endingWipQuantity",
      dataIndex: "endingWipQuantity",
      align: "right",
      width: 90,
      render: (value: number, row) => `${value} ${row.productUnit}`
    },
    {
      title: "本期归集",
      key: "incurred",
      align: "right",
      width: 130,
      render: (_, row) =>
        formatCents(row.costs.reduce((sum, cost) => sum + cost.incurredCents, 0))
    },
    {
      title: "期初在产",
      key: "opening",
      align: "right",
      width: 120,
      render: (_, row) => {
        const opening = row.costs.reduce((sum, cost) => sum + cost.openingWipCents, 0);
        // 0 与「没有上期」在这里是同一件事：都表示这个产品从零开始。
        return opening === 0 ? (
          <Typography.Text type="secondary">—</Typography.Text>
        ) : (
          formatCents(opening)
        );
      }
    },
    {
      title: "状态",
      key: "status",
      dataIndex: "status",
      width: 90,
      render: (status: ProductionRunStatus) => (
        <Tag color={STATUS_META[status].color}>{STATUS_META[status].label}</Tag>
      )
    },
    {
      title: "操作",
      key: "actions",
      width: 120,
      render: (_, row) =>
        row.status === "draft" ? (
          <Button
            type="primary"
            size="small"
            icon={<CalculatorOutlined />}
            onClick={() => void openPreview(row)}
          >
            试算结转
          </Button>
        ) : (
          <Button size="small" onClick={() => void openPreview(row)}>
            看分配
          </Button>
        )
    }
  ];

  const costColumns: ColumnsType<RunCost> = [
    {
      title: "成本项",
      dataIndex: "element",
      render: (element: RunCost["element"]) => COST_ELEMENT_LABELS[element]
    },
    {
      title: "完工程度",
      dataIndex: "wipCompletionBp",
      align: "right",
      width: 100,
      render: (bp: number) => {
        const percent = (bp / TOTAL_BASIS_POINTS) * 100;
        // 材料 100% 是常态，标出来让人一眼确认没配错——用加工进度去分材料
        // 会让完工成本被高估，而那个错在数字上看不出来。
        return bp === TOTAL_BASIS_POINTS ? (
          <Tag color="blue">100%（开工即投料）</Tag>
        ) : (
          `${percent}%`
        );
      }
    },
    {
      title: "期初在产",
      dataIndex: "openingWipCents",
      align: "right",
      width: 110,
      render: (value: number) => formatCents(value)
    },
    {
      title: "本期归集",
      dataIndex: "incurredCents",
      align: "right",
      width: 110,
      render: (value: number) => formatCents(value)
    }
  ];

  // V15：默认只显示核心列。17 列里真正决定「这批要不要结转」的只有 7 列，
  // 其余（期初在产、归集金额明细）是要查的时候才看。
  const {
    columns: visibleColumns,
    preset,
    setPreset,
    hiddenCount
  } = useColumnPreset("production-runs", columns, [
    "period",
    "product",
    "finishedQuantity",
    "endingWipQuantity",
    "status",
    "actions"
  ]);

  return (
    <div>
      <PageHeader
        title="成本结转"
        subtitle="按约当产量法把料工费分给完工产品与在产品。结转生成凭证草稿，需复核后过账"
        actions={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void reload()}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
              录入本期生产
            </Button>
          </Space>
        }
      />

      {loadError && <Alert type="error" showIcon message={loadError} style={{ marginBottom: 16 }} />}

      {/* V15：从常驻 Alert 改成折叠。这条给 defaultOpen——**不看会做错**，
          用同一个完工程度分三项是这里最常见的错，而它的后果在数字上看不出来。 */}
      <Explain
        title="三个成本项的完工程度不一样，这是算对的关键"
        storageKey="cost.completion"
        defaultOpen
      >
        <strong>直接材料通常是 100%</strong>
        ——开工时一次性投料，做了一半的机器里料是齐的；人工与制造费用按加工进度。
        用同一个进度分三项会让在产品的约当量变小，
        <strong>完工产品反而多分到成本</strong>，而那笔差额要到毛利异常时才有人发现。
      </Explain>

      {loading ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : runs.length === 0 ? (
        <Empty description="还没有生产批次。成本结转需要先录入产量与料工费归集。">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
            录第一批
          </Button>
        </Empty>
      ) : (
        <>
          {pendingCount > 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message={`有 ${pendingCount} 个批次还没结转`}
              description="没结转的部分一直挂在生产成本上，库存商品与主营业务成本都会偏低。"
            />
          )}
          <>
            {/* 折起来的列数要显示——不显示等于假装表就这么宽 */}
            {hiddenCount > 0 && (
              <Space style={{ marginBottom: 8 }}>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  已折起 {hiddenCount} 列
                </Typography.Text>
                <Button size="small" type="link" onClick={() => setPreset("all")}>
                  显示全部
                </Button>
              </Space>
            )}
            {preset === "all" && (
              <Button
                size="small"
                type="link"
                style={{ marginBottom: 8, paddingLeft: 0 }}
                onClick={() => setPreset("core")}
              >
                只看核心列
              </Button>
            )}
            <Table<ProductionRun>
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={runs}
              columns={visibleColumns}
            />
          </>
        </>
      )}

      <Modal
        open={previewing !== null}
        width={860}
        title={previewing ? `试算：${previewing.productName} ${previewing.period}` : ""}
        okText="确认结转"
        cancelText="取消"
        confirmLoading={carrying}
        okButtonProps={{
          disabled: previewing?.status !== "draft" || allocation === null
        }}
        onCancel={() => setPreviewing(null)}
        onOk={() => void handleCarryOver()}
      >
        {previewing && (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Descriptions size="small" column={3} bordered>
              <Descriptions.Item label="完工数量">
                {previewing.finishedQuantity} {previewing.productUnit}
              </Descriptions.Item>
              <Descriptions.Item label="期末在产">
                {previewing.endingWipQuantity} {previewing.productUnit}
              </Descriptions.Item>
              <Descriptions.Item label="记账日期">
                <DatePicker
                  size="small"
                  allowClear={false}
                  value={accountingDate}
                  onChange={(value) => value && setAccountingDate(value)}
                />
              </Descriptions.Item>
            </Descriptions>

            <div>
              <Typography.Title level={5} style={{ marginBottom: 8 }}>
                投入
              </Typography.Title>
              <Table<RunCost>
                rowKey="element"
                size="small"
                pagination={false}
                dataSource={previewing.costs}
                columns={costColumns}
              />
            </div>

            {allocationError !== null && (
              <Alert type="error" showIcon message="试算失败" description={allocationError} />
            )}

            {previewLoading ? (
              <Skeleton active paragraph={{ rows: 2 }} />
            ) : allocation !== null ? (
              <Card size="small" title="分配结果">
                <Space size="large" style={{ marginBottom: 12 }}>
                  <Statistic
                    title="结转到完工产品"
                    value={allocation.totalFinishedCents / 100}
                    precision={2}
                    suffix="元"
                    valueStyle={{ color: "#52c41a" }}
                  />
                  <Statistic
                    title="留在在产品"
                    value={allocation.totalEndingWipCents / 100}
                    precision={2}
                    suffix="元"
                  />
                  <Statistic
                    title="投入合计"
                    value={allocation.totalInputCents / 100}
                    precision={2}
                    suffix="元"
                  />
                </Space>

                {/* 平衡是硬要求：差一分就是借贷不平、凭证过不了账。
                    把它摆出来而不是默默保证——看的人有权自己验一遍。 */}
                <Alert
                  type={
                    allocation.totalFinishedCents + allocation.totalEndingWipCents ===
                    allocation.totalInputCents
                      ? "success"
                      : "error"
                  }
                  showIcon
                  message={
                    allocation.totalFinishedCents + allocation.totalEndingWipCents ===
                    allocation.totalInputCents
                      ? "完工 + 在产 = 投入，一分不差"
                      : "分配结果与投入对不上——这是 bug，请勿结转并反馈"
                  }
                />

                <Table
                  style={{ marginTop: 12 }}
                  rowKey="element"
                  size="small"
                  pagination={false}
                  dataSource={allocation.elements}
                  columns={[
                    {
                      title: "成本项",
                      dataIndex: "element",
                      render: (element: RunCost["element"]) => COST_ELEMENT_LABELS[element]
                    },
                    {
                      title: "约当产量",
                      dataIndex: "equivalentUnitsBp",
                      align: "right",
                      width: 110,
                      render: (bp: number) => (bp / TOTAL_BASIS_POINTS).toLocaleString("zh-CN")
                    },
                    {
                      title: "单位成本",
                      dataIndex: "unitCostCents",
                      align: "right",
                      width: 110,
                      // 仅供展示——结转金额走下面两列，它们是整数运算的结果。
                      render: (value: number) => formatCents(value)
                    },
                    {
                      title: "转完工",
                      dataIndex: "finishedCents",
                      align: "right",
                      width: 120,
                      render: (value: number) => (
                        <Typography.Text strong>{formatCents(value)}</Typography.Text>
                      )
                    },
                    {
                      title: "留在产",
                      dataIndex: "endingWipCents",
                      align: "right",
                      width: 120,
                      render: (value: number) => formatCents(value)
                    }
                  ]}
                />
              </Card>
            ) : null}

            {previewing.status === "draft" ? (
              <Explain title="结转会做哪一笔账" storageKey="cost.voucher-shape">
                生成一张
                <strong>
                  <Term k="voucher">凭证</Term>草稿
                </strong>
                （借 1403 库存商品 / 贷 4001 生产成本），需会计复核后
                <Term k="posting">过账</Term>。 期末在产品不做
                <Term k="journal-entry">分录</Term>——它本来就留在生产成本的余额里。
              </Explain>
            ) : (
              <Alert
                type="success"
                showIcon
                message="这个批次已经结转过了"
                description={
                  previewing.voucherId
                    ? `凭证：${previewing.voucherId}`
                    : "凭证已被删除，分配结果仍然保留"
                }
              />
            )}
          </Space>
        )}
      </Modal>

      <ProductionRunForm
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => void reload()}
      />
    </div>
  );
}
