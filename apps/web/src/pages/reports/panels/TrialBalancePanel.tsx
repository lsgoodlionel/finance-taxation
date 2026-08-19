/**
 * 试算平衡表 / 科目余额表（V15 补的前台入口）。
 *
 * ## 它是月结前的第一张表
 *
 * 三组合计——期初、本期发生、期末——**每一组的借贷都必须相等**。
 * 不相等意味着账本身有问题，而不是某张报表算错了：资产负债表会照样出得来，
 * 只是它是错的。所以这张表要在看三大报表**之前**看。
 *
 * 后端已经把三组平衡各自算好了（`totals.opening/period/closing`），
 * 界面要做的是**把不平的那一组指出来**，而不是笼统说一句「不平衡」。
 *
 * ## 空行默认折起来
 *
 * 科目表里启用但本期无发生额的科目也会出现在表上（后端用 `full outer join`
 * 保证的，那是对的——漏掉它们会让人以为科目不存在）。但一张一百多行、
 * 八成是零的表没法读。默认只显示有数的行，开关摆在旁边。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Empty, Skeleton, Space, Switch, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { Explain } from "../../../components/ui/Explain";
import { Term } from "../../../components/ui/Term";
import { errorMessage } from "../../../lib/errors";
import { getTrialBalance, type TrialBalanceReport, type TrialBalanceRow } from "../../../lib/api-opening-balance";

export interface TrialBalancePanelProps {
  period: string;
}

/** 金额为 0 时显示 `—`：满屏的 0.00 让人读不出哪里有数。 */
function amount(value: string): React.ReactNode {
  return Number(value) === 0 ? <Typography.Text type="secondary">—</Typography.Text> : value;
}

export function TrialBalancePanel({ period }: TrialBalancePanelProps) {
  const [report, setReport] = useState<TrialBalanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setReport(await getTrialBalance(period));
    } catch (error) {
      // 不静默：加载失败显示成空表会被读成「这个月没有账」。
      setLoadError(errorMessage(error, "试算平衡表加载失败"));
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const rows = useMemo(
    () => (report === null ? [] : showEmpty ? report.rows : report.rows.filter((row) => !row.isEmpty)),
    [report, showEmpty]
  );

  const hiddenEmptyCount = useMemo(
    () => (report === null ? 0 : report.rows.filter((row) => row.isEmpty).length),
    [report]
  );

  const columns: ColumnsType<TrialBalanceRow> = [
    {
      title: "科目",
      key: "account",
      width: 220,
      render: (_, row) => (
        <Space size={4}>
          <Typography.Text code>{row.accountCode}</Typography.Text>
          <span>{row.accountName}</span>
          {/* 账上有、科目表里没有——数据完整性问题，须人工介入 */}
          {!row.isRegistered && <Tag color="red">未登记</Tag>}
        </Space>
      )
    },
    { title: "期初借方", dataIndex: "openingDebit", align: "right", width: 130, render: amount },
    { title: "期初贷方", dataIndex: "openingCredit", align: "right", width: 130, render: amount },
    { title: "本期借方", dataIndex: "periodDebit", align: "right", width: 130, render: amount },
    { title: "本期贷方", dataIndex: "periodCredit", align: "right", width: 130, render: amount },
    { title: "期末借方", dataIndex: "closingDebit", align: "right", width: 130, render: amount },
    { title: "期末贷方", dataIndex: "closingCredit", align: "right", width: 130, render: amount }
  ];

  if (loading) return <Skeleton active paragraph={{ rows: 6 }} />;
  if (loadError !== null) return <Alert type="error" showIcon message={loadError} />;
  if (report === null) return <Empty description="没有取到数据" />;

  const unbalanced = [
    { label: "期初", totals: report.totals.opening },
    { label: "本期发生", totals: report.totals.period },
    { label: "期末", totals: report.totals.closing }
  ].filter((group) => !group.totals.isBalanced);

  return (
    <div>
      <Explain title="这张表要在看三大报表之前看" storageKey="reports.trial-balance-intro">
        三组合计——期初、本期发生、期末——<strong>每一组的借贷都必须相等</strong>。
        不相等意味着<Term k="account">科目</Term>层面的账本身有问题，而不是某张报表算错了：
        <Term k="balance-sheet">资产负债表</Term>会照样出得来，只是它是错的。
        <br />
        期初栏的口径：建库当年用建库至今累计，之后的年度用财年起点累计——
        表上每行都标了自己用的是哪一种。
      </Explain>

      {/* 把不平的那一组指出来，而不是笼统说一句「不平衡」 */}
      {unbalanced.length > 0 ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 12 }}
          message={`${unbalanced.map((g) => g.label).join("、")}不平衡`}
          description={
            <>
              {unbalanced.map((group) => (
                <div key={group.label}>
                  · {group.label}：借 {group.totals.debit} / 贷 {group.totals.credit}，
                  <strong>差 {group.totals.difference}</strong>
                </div>
              ))}
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                先查到这一笔再出报表——现在出的<Term k="balance-sheet">资产负债表</Term>也是错的。
              </Typography.Text>
            </>
          }
        />
      ) : (
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 12 }}
          message="三组合计全部借贷相等"
          description={`期末合计 借 ${report.totals.closing.debit} / 贷 ${report.totals.closing.credit}`}
        />
      )}

      {report.warnings.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 12 }}
          message="需要人工确认"
          description={report.warnings.map((text) => (
            <div key={text}>· {text}</div>
          ))}
        />
      )}

      <Space style={{ marginBottom: 8 }}>
        <Switch size="small" checked={showEmpty} onChange={setShowEmpty} />
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          显示无发生额的科目
          {hiddenEmptyCount > 0 && !showEmpty && `（已折起 ${hiddenEmptyCount} 个）`}
        </Typography.Text>
      </Space>

      <Table<TrialBalanceRow>
        rowKey="accountCode"
        size="small"
        pagination={false}
        scroll={{ x: true }}
        dataSource={rows}
        columns={columns}
        summary={() => (
          <Table.Summary fixed>
            <Table.Summary.Row>
              <Table.Summary.Cell index={0}>
                <Typography.Text strong>合计</Typography.Text>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={1} align="right">
                {report.totals.opening.debit}
              </Table.Summary.Cell>
              <Table.Summary.Cell index={2} align="right">
                {report.totals.opening.credit}
              </Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="right">
                {report.totals.period.debit}
              </Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="right">
                {report.totals.period.credit}
              </Table.Summary.Cell>
              <Table.Summary.Cell index={5} align="right">
                {report.totals.closing.debit}
              </Table.Summary.Cell>
              <Table.Summary.Cell index={6} align="right">
                {report.totals.closing.credit}
              </Table.Summary.Cell>
            </Table.Summary.Row>
          </Table.Summary>
        )}
      />
    </div>
  );
}
