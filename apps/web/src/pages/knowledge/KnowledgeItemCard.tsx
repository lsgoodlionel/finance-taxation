import type { KnowledgeItem } from "@finance-taxation/domain-model";
import { CategoryBadge } from "./CategoryBadge";

type KnowledgeItemCardProps = {
  item: KnowledgeItem;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
};

const actionBtn = {
  padding: "4px 12px", borderRadius: "999px",
  border: "1px solid rgba(20,40,60,0.15)", fontSize: "12px", cursor: "pointer"
} as const;

export function KnowledgeItemCard({
  item,
  expanded,
  onToggleExpand,
  onEdit,
  onToggleActive,
  onDelete
}: KnowledgeItemCardProps) {
  return (
    <div style={{
      borderRadius: "12px", border: "1px solid rgba(20,40,60,0.08)",
      padding: "14px 16px",
      background: item.isActive ? "rgba(255,255,255,0.9)" : "rgba(230,230,230,0.5)",
      opacity: item.isActive ? 1 : 0.7
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px", flexWrap: "wrap" }}>
        <CategoryBadge category={item.category} />
        <strong style={{ fontSize: "15px", flex: 1, minWidth: "120px" }}>{item.title}</strong>
        {item.tags.length > 0 && (
          <span style={{ fontSize: "12px", color: "#6c7a89" }}>
            {item.tags.map((t) => `#${t}`).join(" ")}
          </span>
        )}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button onClick={onToggleExpand} style={actionBtn}>{expanded ? "收起" : "展开"}</button>
          <button onClick={onEdit} style={actionBtn}>编辑</button>
          <button onClick={onToggleActive} style={{ ...actionBtn, color: item.isActive ? "#b45309" : "#15803d" }}>
            {item.isActive ? "停用" : "启用"}
          </button>
          <button onClick={onDelete} style={{ ...actionBtn, border: "1px solid #fca5a5", color: "#b91c1c" }}>删除</button>
        </div>
      </div>
      {expanded && (
        <div style={{ marginTop: "10px", padding: "12px", background: "rgba(20,40,60,0.03)", borderRadius: "8px", fontSize: "14px", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
          {item.content}
        </div>
      )}
    </div>
  );
}
