import type { CSSProperties } from "react";
import { Table, Tag, Tabs, Typography, Empty } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { Voucher, VoucherStatus } from "@finance-taxation/domain-model";
import { VOUCHER_TYPE_LABELS, useI18n } from "../../lib/i18n";
import { VoucherStatusFlow } from "./VoucherStatusFlow";
import { filterVouchersByTab, type VoucherTab } from "./voucher-actions";

const { Text } = Typography;

const TAB_ITEMS: { key: VoucherTab; label: string }[] = [
  { key: "all",             label: "全部" },
  { key: "draft",           label: "草稿" },
  { key: "review_required", label: "待审核" },
  { key: "posted",          label: "已过账" },
];

interface VouchersListProps {
  vouchers: Voucher[];
  selectedId: string | null;
  /** 键盘 j/k 高亮的凭证。 */
  activeId?: string | null;
  activeTab: VoucherTab;
  checkedIds: string[];
  onTabChange: (tab: VoucherTab) => void;
  onSelect: (id: string) => void;
  onCheckedChange: (ids: string[]) => void;
}

export function VouchersList({
  vouchers,
  selectedId,
  activeId,
  activeTab,
  checkedIds,
  onTabChange,
  onSelect,
  onCheckedChange,
}: VouchersListProps) {
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
      title: "类型", dataIndex: "voucherType", key: "type", width: 78,
      render: (v: string) => <Tag style={{ fontSize: 11 }}>{t(VOUCHER_TYPE_LABELS, v)}</Tag>,
    },
    {
      title: "状态流转", dataIndex: "status", key: "status", width: 168,
      render: (status: VoucherStatus) => <VoucherStatusFlow status={status} />,
    },
    {
      title: "创建日期", dataIndex: "createdAt", key: "createdAt", width: 96,
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v?.slice(0, 10)}</Text>,
    },
  ];

  function rowStyle(record: Voucher): CSSProperties {
    if (record.id === activeId) {
      return { cursor: "pointer", background: "rgba(37,99,235,0.12)", boxShadow: "inset 3px 0 0 #2563eb" };
    }
    if (record.id === selectedId) {
      return { cursor: "pointer", background: "rgba(37,99,235,0.05)" };
    }
    return { cursor: "pointer" };
  }

  return (
    <Tabs
      size="small"
      style={{ marginBottom: 0 }}
      activeKey={activeTab}
      onChange={(key) => onTabChange(key as VoucherTab)}
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
            dataSource={filterVouchersByTab(vouchers, tab.key)}
            columns={columns}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 15, hideOnSinglePage: true, size: "small" }}
            locale={{ emptyText: <Empty description="暂无凭证" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
            rowClassName={record => record.id === selectedId ? "ant-table-row-selected" : ""}
            rowSelection={{
              selectedRowKeys: checkedIds,
              columnWidth: 36,
              onChange: (keys) => onCheckedChange(keys.map(String)),
            }}
            onRow={record => ({
              style: rowStyle(record),
              onClick: () => onSelect(record.id),
            })}
          />
        ),
      }))}
    />
  );
}
