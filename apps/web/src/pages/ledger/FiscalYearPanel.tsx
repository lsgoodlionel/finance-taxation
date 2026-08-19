/**
 * 年度结转（V15 补的前台入口，后端是 V12-B5）。
 *
 * ## 它一年只做一次，但不做就没法开始下一年
 *
 * 年末把本年利润（3131）结转到未分配利润（3141）。不做的后果不是报错，
 * 是**第二年的利润表把第一年的利润也算进去**——而那个错要到报税时才被发现。
 *
 * ## 两种拒绝要说清楚
 *
 * 后端会拒两种情况：十二个月里还有月份没做损益结转、上一年度还没结账。
 * 只显示一句「结转失败」等于让人自己去猜是哪一种，而这两种的处理方式
 * 完全不同（一个是回去结月、一个是先结上一年）。
 *
 * ## 已结转的年度不给按钮
 *
 * 后端幂等（再结一次返回 `alreadyClosed` 不生成第二张凭证），但界面上仍然
 * 不给按钮——**一个点了没有任何效果的按钮，比没有按钮更让人困惑**。
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Empty, Popconfirm, Skeleton, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { toast } from "sonner";
import { Explain } from "../../components/ui/Explain";
import { Term } from "../../components/ui/Term";
import { errorMessage } from "../../lib/errors";
import { closeFiscalYear, listFiscalYears, type FiscalYearRow } from "../../lib/api-opening-balance";

export function FiscalYearPanel() {
  const [years, setYears] = useState<FiscalYearRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [closingYear, setClosingYear] = useState<number | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await listFiscalYears();
      setYears(data.fiscalYears);
    } catch (error) {
      // 不静默：加载失败显示成空会被读成「还没有任何财年」，
      // 而用户会以为不需要结转。
      setLoadError(errorMessage(error, "财年列表加载失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleClose = async (year: number) => {
    setClosingYear(year);
    try {
      const result = await closeFiscalYear(year);
      toast.success(
        result.alreadyClosed
          ? `${year} 年此前已经结转过了`
          : `${year} 年已结转，净利润 ${result.netProfit}，凭证草稿待复核`
      );
      await reload();
    } catch (error) {
      // 后端的两种拒绝（月份未结转 / 上年未结账）原文透给用户——
      // 它们的处理方式完全不同，压成一句话等于让人自己猜。
      toast.error(errorMessage(error, "年度结转失败"));
    } finally {
      setClosingYear(null);
    }
  };

  const columns: ColumnsType<FiscalYearRow> = [
    {
      title: "会计年度",
      dataIndex: "year",
      width: 110,
      render: (year: number) => <Typography.Text strong>{year}</Typography.Text>
    },
    {
      title: "区间",
      key: "range",
      width: 200,
      render: (_, row) => `${row.startDate} ~ ${row.endDate}`
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (status: FiscalYearRow["status"]) =>
        status === "closed" ? <Tag color="success">已结账</Tag> : <Tag>未结账</Tag>
    },
    {
      title: "净利润",
      dataIndex: "netProfit",
      align: "right",
      width: 160,
      render: (value: string | null) =>
        // null 与 0 不是一回事：null 表示还没结转过，0 表示结转了但不赚不亏。
        value === null ? <Typography.Text type="secondary">未结转</Typography.Text> : value
    },
    {
      title: "结转凭证",
      dataIndex: "closingVoucherId",
      ellipsis: true,
      render: (value: string | null) =>
        value ?? <Typography.Text type="secondary">—</Typography.Text>
    },
    {
      title: "操作",
      key: "actions",
      width: 120,
      render: (_, row) =>
        row.status === "closed" ? (
          // 一个点了没有任何效果的按钮，比没有按钮更让人困惑。
          <Typography.Text type="secondary">—</Typography.Text>
        ) : (
          <Popconfirm
            title={`结转 ${row.year} 年？`}
            description="会生成一张凭证草稿（借 3131 本年利润 / 贷 3141 未分配利润），需复核后过账。"
            onConfirm={() => void handleClose(row.year)}
          >
            <Button type="primary" size="small" loading={closingYear === row.year}>
              年度结转
            </Button>
          </Popconfirm>
        )
    }
  ];

  if (loading) return <Skeleton active paragraph={{ rows: 4 }} />;

  return (
    <div>
      {loadError !== null && (
        <Alert type="error" showIcon message={loadError} style={{ marginBottom: 12 }} />
      )}

      <Explain title="年度结转做什么、不做会怎样" storageKey="ledger.fiscal-year-intro">
        年末把「本年利润」（3131）的余额结转到「未分配利润」（3141），让本年利润归零、
        下一年从头累计。
        <br />
        <strong>
          不做的后果不是报错，是第二年的<Term k="income-statement">利润表</Term>
          把第一年的利润也算进去
        </strong>
        ——而那个错通常要到报税时才被发现。
        <br />
        两个前提：十二个月都做完了损益结转、上一年度已经结账。缺哪个后端会明确告诉你。
        结转生成的是<Term k="voucher">凭证</Term>草稿，需复核后
        <Term k="posting">过账</Term>。
      </Explain>

      {years.length === 0 ? (
        <Empty description="还没有财年记录。有了第一笔分录之后会自动补建。" />
      ) : (
        <Table<FiscalYearRow>
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={years}
          columns={columns}
        />
      )}
    </div>
  );
}
