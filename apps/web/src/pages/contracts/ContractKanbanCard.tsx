import { Tag, Typography } from "antd";
import { CalendarOutlined, DollarOutlined, WarningOutlined } from "@ant-design/icons";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ContractWithEventCount } from "@finance-taxation/domain-model";

const { Text } = Typography;

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  sales: "销售",
  procurement: "采购",
  lease: "租赁",
  service: "服务",
  other: "其他",
};

interface Props {
  contract: ContractWithEventCount;
  isOverlay?: boolean;
  onClick?: (id: string) => void;
}

export function ContractKanbanCard({ contract, isOverlay, onClick }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: contract.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
    cursor: isOverlay ? "grabbing" : "grab",
  };

  const isExpiringSoon =
    contract.endDate
      ? new Date(contract.endDate).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000
      : false;

  const amtDisplay = contract.amount > 0
    ? `¥${contract.amount.toLocaleString("zh-CN", { minimumFractionDigits: 0 })}`
    : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick?.(contract.id)}
    >
      <div
        style={{
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 10,
          padding: "10px 12px",
          boxShadow: isOverlay ? "0 8px 24px rgba(0,0,0,0.14)" : "0 1px 3px rgba(0,0,0,0.06)",
          display: "grid",
          gap: 6,
          userSelect: "none",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
          <Text
            strong
            style={{ fontSize: 13, lineHeight: 1.4, flex: 1 }}
            ellipsis={{ tooltip: contract.title }}
          >
            {contract.title}
          </Text>
          {isExpiringSoon && (
            <WarningOutlined style={{ color: "#d97706", fontSize: 13, flexShrink: 0, marginTop: 2 }} />
          )}
        </div>

        <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
          {contract.counterpartyName}
        </Text>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <Tag color="blue" style={{ fontSize: 10, margin: 0, lineHeight: "18px" }}>
            {CONTRACT_TYPE_LABELS[contract.contractType] ?? contract.contractType}
          </Tag>
          {amtDisplay && (
            <span style={{ fontSize: 11, color: "#64748b" }}>
              <DollarOutlined style={{ marginRight: 2 }} />{amtDisplay}
            </span>
          )}
          {contract.relatedEventCount > 0 && (
            <span style={{ fontSize: 11, color: "#64748b" }}>
              {contract.relatedEventCount} 事项
            </span>
          )}
        </div>

        {contract.endDate && (
          <div style={{ fontSize: 11, color: isExpiringSoon ? "#d97706" : "#94a3b8" }}>
            <CalendarOutlined style={{ marginRight: 4 }} />
            到期：{contract.endDate.slice(0, 10)}
          </div>
        )}
      </div>
    </div>
  );
}
