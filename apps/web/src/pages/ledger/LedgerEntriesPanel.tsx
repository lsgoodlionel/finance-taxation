import React from "react";
import { Button, Input, Pagination, Space, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { LedgerEntry, LedgerPostingBatch } from "@finance-taxation/domain-model";
import { DataTableShell } from "../../components/ui/DataTableShell";
import { EmptyState } from "../../components/ui/EmptyState";
import { useQueryState } from "../../hooks/useQueryState";

const { Text } = Typography;

const PAGE_SIZE = 20;

type LedgerEntriesPanelProps = {
  entries: LedgerEntry[];
  batches: LedgerPostingBatch[];
  selectedVoucherId: string;
  selectedEventId: string;
  onVoucherIdChange: (value: string) => void;
  onEventIdChange: (value: string) => void;
  onFilter: () => void;
  onClear: () => void;
};

const BATCH_COLUMNS: ColumnsType<LedgerPostingBatch> = [
  {
    title: "批次编号",
    dataIndex: "id",
    key: "id",
    render: (value: string) => <Text code>{value}</Text>,
  },
  {
    title: "凭证",
    dataIndex: "voucherId",
    key: "voucherId",
    render: (value: string) => <Text>{value}</Text>,
  },
  {
    title: "事项",
    dataIndex: "businessEventId",
    key: "businessEventId",
    render: (value: string) => <Text type="secondary">{value}</Text>,
  },
  {
    title: "分录数",
    key: "entryCount",
    width: 90,
    align: "right",
    render: (_, row) => <Text>{row.entryIds.length}</Text>,
  },
  {
    title: "过账时间",
    dataIndex: "postedAt",
    key: "postedAt",
    width: 180,
    render: (value: string) => <Text type="secondary">{value}</Text>,
  },
];

const ENTRY_COLUMNS: ColumnsType<LedgerEntry> = [
  {
    title: "日期",
    dataIndex: "entryDate",
    key: "entryDate",
    width: 110,
    render: (value: string) => <Text>{value}</Text>,
  },
  {
    title: "摘要",
    dataIndex: "summary",
    key: "summary",
    render: (value: string) => <Text>{value}</Text>,
  },
  {
    title: "科目",
    key: "account",
    render: (_, row) => (
      <div style={{ display: "grid", gap: 2 }}>
        <Text>{row.accountName}</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>{row.accountCode}</Text>
      </div>
    ),
  },
  {
    title: "借方",
    dataIndex: "debit",
    key: "debit",
    align: "right",
    width: 120,
    render: (value: string) => <Text style={{ color: "#2563eb" }}>{value}</Text>,
  },
  {
    title: "贷方",
    dataIndex: "credit",
    key: "credit",
    align: "right",
    width: 120,
    render: (value: string) => <Text style={{ color: "#7c3aed" }}>{value}</Text>,
  },
  {
    title: "来源凭证",
    dataIndex: "voucherId",
    key: "voucherId",
    width: 150,
    render: (value: string) => <Text type="secondary">{value}</Text>,
  },
];

export function LedgerEntriesPanel(props: LedgerEntriesPanelProps) {
  const {
    entries,
    batches,
    selectedVoucherId,
    selectedEventId,
    onVoucherIdChange,
    onEventIdChange,
    onFilter,
    onClear,
  } = props;

  const [batchPageStr, setBatchPageStr] = useQueryState("batchPage", "1");
  const [entryPageStr, setEntryPageStr] = useQueryState("entryPage", "1");

  const batchPage = Math.max(1, parseInt(batchPageStr, 10) || 1);
  const entryPage = Math.max(1, parseInt(entryPageStr, 10) || 1);
  const safeBatchPage = Math.min(batchPage, Math.max(1, Math.ceil(batches.length / PAGE_SIZE)));
  const safeEntryPage = Math.min(entryPage, Math.max(1, Math.ceil(entries.length / PAGE_SIZE)));
  const batchItems = batches.slice((safeBatchPage - 1) * PAGE_SIZE, safeBatchPage * PAGE_SIZE);
  const entryItems = entries.slice((safeEntryPage - 1) * PAGE_SIZE, safeEntryPage * PAGE_SIZE);

  return (
    <div style={{ display: "grid", gap: "24px" }}>
      <DataTableShell title="过滤条件">
        <p className="v3-section-description" style={{ marginBottom: "12px" }}>
          先按凭证编号或事项编号收缩范围，再查看对应过账批次和总账分录。
        </p>
        <Space wrap size={10}>
          <Input
            value={selectedVoucherId}
            onChange={(event) => onVoucherIdChange(event.target.value)}
            placeholder="输入凭证编号过滤"
            style={{ width: 240 }}
          />
          <Input
            value={selectedEventId}
            onChange={(event) => onEventIdChange(event.target.value)}
            placeholder="输入事项编号过滤"
            style={{ width: 240 }}
          />
          <Button type="primary" onClick={onFilter}>过滤</Button>
          <Button onClick={onClear}>清空</Button>
        </Space>
      </DataTableShell>

      <DataTableShell
        title="过账批次"
        actions={(
          <span className="v3-banner" data-tone="info" style={{ padding: "6px 10px", fontSize: "12px" }}>
            当前批次数：{batches.length}
          </span>
        )}
      >
        {batches.length === 0 ? (
          <EmptyState title="暂无过账批次" description="当前过滤条件下没有匹配的批次，可调整凭证或事项编号后重试。" />
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <Table<LedgerPostingBatch>
              dataSource={batchItems}
              columns={BATCH_COLUMNS}
              rowKey="id"
              size="small"
              pagination={false}
              scroll={{ x: 760 }}
            />
            {batches.length > PAGE_SIZE ? (
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Pagination
                  current={safeBatchPage}
                  total={batches.length}
                  pageSize={PAGE_SIZE}
                  showSizeChanger={false}
                  showTotal={(total) => `共 ${total} 条`}
                  onChange={(next) => setBatchPageStr(String(next))}
                  size="small"
                />
              </div>
            ) : null}
          </div>
        )}
      </DataTableShell>

      <DataTableShell
        title="总账分录"
        actions={(
          <span className="v3-banner" data-tone="info" style={{ padding: "6px 10px", fontSize: "12px" }}>
            当前分录数：{entries.length}
          </span>
        )}
      >
        {entries.length === 0 ? (
          <EmptyState title="暂无总账分录" description="当前过滤条件下没有匹配分录，可恢复全部总账数据后继续查看。" />
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            <Table<LedgerEntry>
              dataSource={entryItems}
              columns={ENTRY_COLUMNS}
              rowKey="id"
              size="small"
              pagination={false}
              scroll={{ x: 860 }}
            />
            {entries.length > PAGE_SIZE ? (
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Pagination
                  current={safeEntryPage}
                  total={entries.length}
                  pageSize={PAGE_SIZE}
                  showSizeChanger={false}
                  showTotal={(total) => `共 ${total} 条`}
                  onChange={(next) => setEntryPageStr(String(next))}
                  size="small"
                />
              </div>
            ) : null}
          </div>
        )}
      </DataTableShell>
    </div>
  );
}
