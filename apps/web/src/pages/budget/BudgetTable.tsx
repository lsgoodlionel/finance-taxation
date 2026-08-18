/**
 * 预算执行表（V13-A2）。
 *
 * 一行一条预算，把三个数（预算 / 已占用 / 已发生）连同可用额度摊开显示。
 *
 * ## 为什么不用进度条当主视觉
 *
 * 进度条只能表达一个比例，而这里有两个来源不同的消耗：已占用是「批了还没付」，
 * 已发生是「已经花掉」。堆叠进度条看着漂亮，但用户真正要回答的问题是
 * 「我还能批多少」——那是一个数字，不是一段长度。所以可用额度用大号数字，
 * 构成用小字列在旁边。
 */

import React from "react";
import { Button, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { BudgetWithUsage } from "../../lib/api-expense-control";
import {
  budgetStatus,
  describeDimension,
  formatCents,
  PERIOD_TYPE_LABELS,
  utilizationRatio,
  type BudgetStatus
} from "./budget-view";

const STATUS_META: Record<BudgetStatus, { color: string; label: string }> = {
  healthy: { color: "green", label: "正常" },
  tight: { color: "orange", label: "吃紧" },
  overrun: { color: "red", label: "超支" }
};

export interface BudgetTableProps {
  items: readonly BudgetWithUsage[];
  loading?: boolean;
  /** 成本中心 id → 名称，用于把维度显示成人话。 */
  costCenterNames?: Readonly<Record<string, string>>;
  onSelect?: (budget: BudgetWithUsage) => void;
  /** 调额度。没传则不显示操作列——只读角色看得到预算但改不了。 */
  onAdjust?: (budget: BudgetWithUsage) => void;
  /** 删除。有未结占用时服务端会拒，这里不预判。 */
  onDelete?: (budget: BudgetWithUsage) => void;
}

export function BudgetTable({
  items,
  loading,
  costCenterNames,
  onSelect,
  onAdjust,
  onDelete
}: BudgetTableProps) {
  const columns: ColumnsType<BudgetWithUsage> = [
    {
      title: "期间",
      dataIndex: "periodKey",
      width: 120,
      render: (_, row) => (
        <span>
          {row.periodKey}
          <Typography.Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
            {PERIOD_TYPE_LABELS[row.periodType]}
          </Typography.Text>
        </span>
      )
    },
    {
      title: "范围",
      key: "dimension",
      render: (_, row) => describeDimension(row, costCenterNames?.[row.costCenterId ?? ""])
    },
    {
      title: "预算",
      dataIndex: "amountCents",
      align: "right",
      width: 130,
      render: (value: number) => formatCents(value)
    },
    {
      title: "已占用",
      dataIndex: "encumberedCents",
      align: "right",
      width: 130,
      render: (value: number) => (
        <Typography.Text type={value > 0 ? undefined : "secondary"}>
          {formatCents(value)}
        </Typography.Text>
      )
    },
    {
      title: "已发生",
      dataIndex: "actualCents",
      align: "right",
      width: 130,
      render: (value: number) => formatCents(value)
    },
    {
      title: "可用",
      dataIndex: "availableCents",
      align: "right",
      width: 140,
      render: (value: number) => (
        // 超支时显示负数而不是「0」或「已超支」——差额不凑平，
        // 用户要知道超了多少才能决定是追加预算还是驳回单据。
        <Typography.Text strong type={value < 0 ? "danger" : undefined}>
          {formatCents(value)}
        </Typography.Text>
      )
    },
    {
      title: "状态",
      key: "status",
      width: 110,
      render: (_, row) => {
        const status = budgetStatus(row);
        const ratio = utilizationRatio(row);
        return (
          <span>
            <Tag color={STATUS_META[status].color}>{STATUS_META[status].label}</Tag>
            {ratio !== null && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {Math.round(ratio * 100)}%
              </Typography.Text>
            )}
          </span>
        );
      }
    },
    // 操作列只在有回调时出现：只读角色看得到预算但改不了。
    ...(onAdjust || onDelete
      ? [
          {
            title: "操作",
            key: "actions",
            width: 130,
            render: (_: unknown, row: BudgetWithUsage) => (
              <Space size={4}>
                {onAdjust && (
                  <Button
                    size="small"
                    onClick={(e) => {
                      // 行本身可能带 onSelect，别让点按钮也触发选中。
                      e.stopPropagation();
                      onAdjust(row);
                    }}
                  >
                    调额度
                  </Button>
                )}
                {onDelete && (
                  <Button
                    size="small"
                    danger
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(row);
                    }}
                  >
                    删除
                  </Button>
                )}
              </Space>
            )
          } as ColumnsType<BudgetWithUsage>[number]
        ]
      : [])
  ];

  return (
    <Table<BudgetWithUsage>
      rowKey="id"
      size="small"
      loading={loading}
      dataSource={items as BudgetWithUsage[]}
      columns={columns}
      pagination={false}
      onRow={(row) => ({
        onClick: () => onSelect?.(row),
        style: onSelect ? { cursor: "pointer" } : undefined
      })}
      locale={{ emptyText: "还没有预算。先立一条，超支才拦得住。" }}
    />
  );
}
