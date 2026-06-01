import { Table, Typography, Pagination, Space, Button, Segmented } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useQueryState } from "../../hooks/useQueryState";
import { DataTableShell } from "../../components/ui/DataTableShell";
import { EmptyState } from "../../components/ui/EmptyState";
import type { JournalItem } from "./types";

const { Text } = Typography;

const PAGE_SIZE = 20;

type LedgerJournalPanelProps = {
  items: JournalItem[];
  journalType: "cash" | "bank";
  journalFrom: string;
  journalTo: string;
  onJournalTypeChange: (value: "cash" | "bank") => void;
  onJournalFromChange: (value: string) => void;
  onJournalToChange: (value: string) => void;
  onLoadJournal: () => void;
};

const COLUMNS: ColumnsType<JournalItem> = [
  {
    title: "日期",
    dataIndex: "postedAt",
    key: "postedAt",
    width: 100,
    render: (v: string) => <Text style={{ fontSize: 12 }}>{v?.slice(0, 10)}</Text>,
  },
  {
    title: "科目",
    key: "account",
    render: (_, row) => (
      <div>
        <Text type="secondary" style={{ fontSize: 11 }}>{row.accountCode}</Text>{" "}
        <Text style={{ fontSize: 13 }}>{row.accountName}</Text>
      </div>
    ),
  },
  {
    title: "摘要",
    dataIndex: "summary",
    key: "summary",
    render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text>,
  },
  {
    title: "借方",
    dataIndex: "debit",
    key: "debit",
    align: "right",
    render: (v: string) => {
      const n = parseFloat(v || "0");
      return n > 0 ? <Text style={{ color: "#2563eb" }}>{v}</Text> : null;
    },
  },
  {
    title: "贷方",
    dataIndex: "credit",
    key: "credit",
    align: "right",
    render: (v: string) => {
      const n = parseFloat(v || "0");
      return n > 0 ? <Text style={{ color: "#7c3aed" }}>{v}</Text> : null;
    },
  },
  {
    title: "余额",
    dataIndex: "balance",
    key: "balance",
    align: "right",
    render: (v: string) => {
      const n = parseFloat(v || "0");
      const color = n < 0 ? "#dc2626" : "inherit";
      return <Text style={{ fontWeight: 600, color }}>{v}</Text>;
    },
  },
  {
    title: "来源凭证",
    dataIndex: "voucherId",
    key: "voucherId",
    width: 120,
    render: (v: string) => (
      <Text type="secondary" style={{ fontSize: 11 }}>
        {v?.slice(-8).toUpperCase()}
      </Text>
    ),
  },
];

export function LedgerJournalPanel(props: LedgerJournalPanelProps) {
  const {
    items,
    journalType,
    journalFrom,
    journalTo,
    onJournalTypeChange,
    onJournalFromChange,
    onJournalToChange,
    onLoadJournal,
  } = props;

  const [pageStr, setPageStr] = useQueryState("jPage", "1");
  const page = Math.max(1, parseInt(pageStr, 10) || 1);

  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const safePage = Math.min(page, Math.max(1, totalPages));
  const pageItems = items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function handlePageChange(next: number) {
    setPageStr(String(next));
  }

  const filterBar = (
    <Space wrap size={8}>
      <Segmented
        value={journalType}
        options={[
          { label: "现金（1001）", value: "cash" },
          { label: "银行存款（1002）", value: "bank" },
        ]}
        onChange={(v) => onJournalTypeChange(v as "cash" | "bank")}
      />
      <input
        value={journalFrom}
        onChange={(e) => onJournalFromChange(e.target.value)}
        placeholder="开始日期 2026-01-01"
        style={{ width: 150, padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db" }}
      />
      <input
        value={journalTo}
        onChange={(e) => onJournalToChange(e.target.value)}
        placeholder="结束日期 2026-12-31"
        style={{ width: 150, padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db" }}
      />
      <Button type="primary" size="small" onClick={onLoadJournal}>查询</Button>
    </Space>
  );

  return (
    <DataTableShell
      title={`${journalType === "cash" ? "现金" : "银行"}日记账${items.length > 0 ? `（共 ${items.length} 条）` : ""}`}
      actions={filterBar}
    >
      {items.length === 0 ? (
        <EmptyState
          title="暂无日记账记录"
          description="请先确认资金账类型和日期范围，再点击查询加载当前场景的数据。"
        />
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <Table<JournalItem>
            dataSource={pageItems}
            columns={COLUMNS}
            rowKey="id"
            size="small"
            pagination={false}
            style={{ fontSize: 13 }}
          />
          {items.length > PAGE_SIZE && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Pagination
                current={safePage}
                total={items.length}
                pageSize={PAGE_SIZE}
                showSizeChanger={false}
                showTotal={(total) => `共 ${total} 条`}
                onChange={handlePageChange}
                size="small"
              />
            </div>
          )}
        </div>
      )}
    </DataTableShell>
  );
}
