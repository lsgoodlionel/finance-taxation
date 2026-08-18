/**
 * 费用构成分析（V13-D6）。
 *
 * 三个维度并排：按部门、按类型、按人员。
 *
 * ## 为什么放在预算中心而不是财务报表
 *
 * 报表页是**总账口径**（法定三表），这里是**报销口径**——数据源是报销单，
 * 因为「费用类型」与「谁报的」这两个维度只存在于报销单上，总账里没有。
 *
 * 两个口径混在一页会造成混淆：同一个月，报表上的管理费用和这里的合计
 * 对不上是正常的（不经报销直接入账的费用不在这里）。分开放，并把口径
 * 说明摆在最上面。
 *
 * 而「还能花多少」（预算）与「钱花在哪了」（构成）是同一个人在同一个场景下
 * 的两个问题，放一起是对的。
 */

import React from "react";
import { Alert, Card, Empty, Progress, Space, Statistic, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { ExpenseAnalysis, ExpenseAnalysisRow } from "../../lib/api-expense-control";
import { formatCents } from "./budget-view";

function buildColumns(totalCents: number): ColumnsType<ExpenseAnalysisRow> {
  return [
    { title: "名称", dataIndex: "label", ellipsis: true },
    {
      title: "金额",
      dataIndex: "amountCents",
      align: "right",
      width: 120,
      render: (value: number) => formatCents(value)
    },
    {
      title: "占比",
      key: "ratio",
      width: 120,
      render: (_, row) =>
        totalCents === 0 ? (
          // 合计为 0 时占比无意义。显示 0% 会让人以为「这项没花钱」，
          // 而实际是整个期间都没有数据。
          <Typography.Text type="secondary">—</Typography.Text>
        ) : (
          <Progress
            percent={Math.round((row.amountCents / totalCents) * 100)}
            size="small"
            showInfo
          />
        )
    },
    { title: "笔数", dataIndex: "count", align: "right", width: 70 }
  ];
}

export interface ExpenseAnalysisPanelProps {
  analysis: ExpenseAnalysis;
}

export function ExpenseAnalysisPanel({ analysis }: ExpenseAnalysisPanelProps) {
  const columns = buildColumns(analysis.totalCents);

  if (analysis.totalCents === 0) {
    return (
      <div>
        <Alert
          type="info"
          showIcon
          message="口径说明"
          description={analysis.scopeNote}
          style={{ marginBottom: 16 }}
        />
        <Empty description={`${analysis.period} 没有已批准的报销单`} />
      </div>
    );
  }

  return (
    <div>
      <Alert
        type="info"
        showIcon
        message="口径说明"
        description={analysis.scopeNote}
        style={{ marginBottom: 16 }}
      />

      <Space size="large" style={{ marginBottom: 16 }}>
        <Statistic title={`${analysis.period} 报销合计`} value={analysis.totalCents / 100} precision={2} suffix="元" />
        <Statistic title="涉及人数" value={analysis.byApplicant.length} suffix="人" />
      </Space>

      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Card size="small" title="按费用类型">
          <Table<ExpenseAnalysisRow>
            rowKey="key"
            size="small"
            pagination={false}
            dataSource={analysis.byExpenseType}
            columns={columns}
          />
        </Card>

        <Card size="small" title="按部门">
          <Table<ExpenseAnalysisRow>
            rowKey="key"
            size="small"
            pagination={false}
            dataSource={analysis.byCostCenter}
            columns={columns}
            locale={{ emptyText: "没有分摊到部门的费用" }}
          />
        </Card>

        <Card size="small" title="按人员">
          <Table<ExpenseAnalysisRow>
            rowKey="key"
            size="small"
            pagination={false}
            dataSource={analysis.byApplicant}
            columns={columns}
          />
        </Card>
      </Space>
    </div>
  );
}
