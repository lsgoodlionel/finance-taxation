import { useState } from "react";
import { Table, Typography, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { DataTableShell } from "../../components/ui/DataTableShell";
import { EmptyState } from "../../components/ui/EmptyState";
import type { LedgerSummaryItem } from "./types";

const { Text } = Typography;

const CATEGORY_LABELS: Record<string, string> = {
  "1": "资产类",
  "2": "负债类",
  "3": "所有者权益",
  "4": "成本类",
  "5": "损益—收入",
  "6": "损益—费用",
};

interface TreeRow {
  key: string;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
  isGroup?: boolean;
  children?: TreeRow[];
}

function parseAmt(s: string): number {
  return parseFloat(s || "0") || 0;
}

function fmtAmt(n: number): string {
  return n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildTree(items: LedgerSummaryItem[]): TreeRow[] {
  const groupMap = new Map<string, LedgerSummaryItem[]>();
  for (const item of items) {
    const prefix = item.accountCode.charAt(0);
    const existing = groupMap.get(prefix) ?? [];
    groupMap.set(prefix, [...existing, item]);
  }

  return Array.from(groupMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([prefix, children]) => {
      const totalDebit = children.reduce((s, c) => s + parseAmt(c.debit), 0);
      const totalCredit = children.reduce((s, c) => s + parseAmt(c.credit), 0);
      return {
        key: `group-${prefix}`,
        accountCode: `${prefix}xxx`,
        accountName: CATEGORY_LABELS[prefix] ?? `${prefix} 类`,
        debit: fmtAmt(totalDebit),
        credit: fmtAmt(totalCredit),
        isGroup: true,
        children: children.map((item) => ({
          key: item.accountCode,
          accountCode: item.accountCode,
          accountName: item.accountName,
          debit: item.debit,
          credit: item.credit,
        })),
      } as TreeRow;
    });
}

type LedgerSummaryPanelProps = {
  items: LedgerSummaryItem[];
};

const COLUMNS: ColumnsType<TreeRow> = [
  {
    title: "科目编码",
    dataIndex: "accountCode",
    key: "accountCode",
    width: 120,
    render: (code: string, row) =>
      row.isGroup ? (
        <Tag color="blue" style={{ fontWeight: 600 }}>{code}</Tag>
      ) : (
        <Text type="secondary" style={{ fontSize: 12 }}>{code}</Text>
      ),
  },
  {
    title: "科目名称",
    dataIndex: "accountName",
    key: "accountName",
    render: (name: string, row) =>
      row.isGroup ? (
        <Text strong>{name}</Text>
      ) : (
        <Text style={{ paddingLeft: 8 }}>{name}</Text>
      ),
  },
  {
    title: "借方累计",
    dataIndex: "debit",
    key: "debit",
    align: "right",
    render: (v: string, row) =>
      row.isGroup ? (
        <Text strong style={{ color: "#2563eb" }}>{v}</Text>
      ) : (
        <Text>{v}</Text>
      ),
  },
  {
    title: "贷方累计",
    dataIndex: "credit",
    key: "credit",
    align: "right",
    render: (v: string, row) =>
      row.isGroup ? (
        <Text strong style={{ color: "#7c3aed" }}>{v}</Text>
      ) : (
        <Text>{v}</Text>
      ),
  },
];

export function LedgerSummaryPanel({ items }: LedgerSummaryPanelProps) {
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  if (items.length === 0) {
    return (
      <DataTableShell title="科目汇总">
        <EmptyState title="暂无科目汇总" description="当前没有可展示的借贷累计，请先确认是否已有过账数据。" />
      </DataTableShell>
    );
  }

  const treeData = buildTree(items);

  return (
    <DataTableShell title={`科目汇总（${treeData.length} 类 / ${items.length} 个科目）`}>
      <Table<TreeRow>
        dataSource={treeData}
        columns={COLUMNS}
        rowKey="key"
        size="small"
        pagination={false}
        expandable={{
          expandedRowKeys: expandedKeys,
          onExpandedRowsChange: (keys) => setExpandedKeys(keys as string[]),
          rowExpandable: (row) => Boolean(row.children?.length),
        }}
        rowClassName={(row) => (row.isGroup ? "ledger-group-row" : "")}
        style={{ fontSize: 13 }}
      />
    </DataTableShell>
  );
}
