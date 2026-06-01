import { Table, Tag, Tabs, Typography, Empty } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Voucher, VoucherStatus } from "@finance-taxation/domain-model";
import { VOUCHER_STATUS_LABELS, VOUCHER_TYPE_LABELS, useI18n } from "../../lib/i18n";

const { Text } = Typography;

const STATUS_COLOR: Record<VoucherStatus, string> = {
  draft:            "default",
  review_required:  "warning",
  posted:           "success",
};

const TAB_ITEMS: { key: VoucherStatus | "all"; label: string }[] = [
  { key: "all",            label: "全部" },
  { key: "draft",          label: "草稿" },
  { key: "review_required", label: "待审核" },
  { key: "posted",         label: "已过账" },
];

interface VouchersListProps {
  vouchers: Voucher[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function VouchersList({ vouchers, selectedId, onSelect }: VouchersListProps) {
  const { t } = useI18n();

  const columns: ColumnsType<Voucher> = [
    {
      title: "摘要", dataIndex: "summary", key: "summary",
      render: (summary: string, record) => (
        <div>
          <Text strong style={{ fontSize: 13 }}>{summary}</Text>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
            {record.id.slice(-8).toUpperCase()}
          </div>
        </div>
      ),
    },
    {
      title: "类型", dataIndex: "voucherType", key: "type", width: 90,
      render: (v: string) => <Tag style={{ fontSize: 11 }}>{t(VOUCHER_TYPE_LABELS, v)}</Tag>,
    },
    {
      title: "状态", dataIndex: "status", key: "status", width: 90,
      render: (status: VoucherStatus) => (
        <Tag color={STATUS_COLOR[status]} style={{ fontSize: 11 }}>
          {t(VOUCHER_STATUS_LABELS, status)}
        </Tag>
      ),
    },
    {
      title: "关联事项", dataIndex: "businessEventId", key: "event", width: 130,
      render: (v: string) => v ? <Text type="secondary" style={{ fontSize: 11 }}>{v.slice(0, 8)}</Text> : "—",
    },
    {
      title: "创建日期", dataIndex: "createdAt", key: "createdAt", width: 110,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v?.slice(0, 10)}</Text>,
    },
  ];

  return (
    <Tabs
      size="small"
      style={{ marginBottom: 0 }}
      items={TAB_ITEMS.map(tab => ({
        key: tab.key,
        label: (
          <span>
            {tab.label}
            {tab.key !== "all" && (
              <Tag style={{ marginLeft: 4, fontSize: 10, lineHeight: "16px", padding: "0 4px" }}>
                {vouchers.filter(v => v.status === tab.key).length}
              </Tag>
            )}
          </span>
        ),
        children: (
          <Table
            dataSource={tab.key === "all" ? vouchers : vouchers.filter(v => v.status === tab.key)}
            columns={columns}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 15, hideOnSinglePage: true, size: "small" }}
            locale={{ emptyText: <Empty description="暂无凭证" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
            rowClassName={record => record.id === selectedId ? "ant-table-row-selected" : ""}
            onRow={record => ({
              style: { cursor: "pointer", background: record.id === selectedId ? "rgba(37,99,235,0.05)" : undefined },
              onClick: () => onSelect(record.id),
            })}
          />
        ),
      }))}
    />
  );
}
