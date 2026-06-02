import type { KnowledgeItem } from "@finance-taxation/domain-model";
import { EmptyState } from "../../components/ui/EmptyState";
import { KnowledgeItemCard } from "./KnowledgeItemCard";

type KnowledgeListProps = {
  items: KnowledgeItem[];
  total: number;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onEdit: (item: KnowledgeItem) => void;
  onToggleActive: (item: KnowledgeItem) => void;
  onDelete: (item: KnowledgeItem) => void;
};

export function KnowledgeList({
  items,
  total,
  expandedId,
  onToggleExpand,
  onEdit,
  onToggleActive,
  onDelete
}: KnowledgeListProps) {
  return (
    <div style={{ display: "grid", gap: "12px" }}>
      <div style={{ color: "#6c7a89", fontSize: "13px" }}>
        显示 {items.length} / {total} 条
      </div>
      {items.length === 0 ? (
        <EmptyState
          title="暂无条目"
          description="点击「新增条目」添加企业制度，或点击「从文件导入」批量上传 PDF / Word 文档。"
        />
      ) : (
        <div style={{ display: "grid", gap: "10px" }}>
          {items.map((item) => (
            <KnowledgeItemCard
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              onToggleExpand={() => onToggleExpand(item.id)}
              onEdit={() => onEdit(item)}
              onToggleActive={() => onToggleActive(item)}
              onDelete={() => onDelete(item)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
