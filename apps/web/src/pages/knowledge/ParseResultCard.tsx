import { useState } from "react";
import type { ParsedKnowledgeItem } from "../../lib/api";
import { CategoryBadge } from "./CategoryBadge";

type ParseResultCardProps = {
  item: ParsedKnowledgeItem;
  onFill: () => void;
  onSaveDirectly: () => Promise<void>;
  saving: boolean;
};

export function ParseResultCard({ item, onFill, onSaveDirectly, saving }: ParseResultCardProps) {
  const [expanded, setExpanded] = useState(false);

  if (item.error) {
    return (
      <div style={{
        borderRadius: "12px", border: "1px solid rgba(220,38,38,0.25)",
        padding: "14px 16px", background: "rgba(254,242,242,0.8)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
          <span style={{ color: "#dc2626" }}>⚠</span>
          <span style={{ fontWeight: 600, flex: 1 }}>{item.fileName}</span>
          <span style={{ color: "#dc2626", fontSize: "12px" }}>{item.error}</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      borderRadius: "12px", border: "1px solid rgba(20,40,60,0.1)",
      padding: "16px", background: "rgba(255,255,255,0.95)"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
        <CategoryBadge category={item.category} />
        <strong style={{ fontSize: "14px", flex: 1, minWidth: 0 }}>{item.title}</strong>
        <span style={{ fontSize: "11px", color: "#9aa5b4", flexShrink: 0 }}>来自：{item.fileName}</span>
      </div>

      {item.tags.length > 0 && (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "10px" }}>
          {item.tags.map((tag) => (
            <span key={tag} style={{
              fontSize: "11px", padding: "2px 8px", borderRadius: "999px",
              background: "rgba(20,40,60,0.06)", color: "#4d5d6c"
            }}>#{tag}</span>
          ))}
        </div>
      )}

      <div style={{
        fontSize: "13px", lineHeight: 1.7, color: "#4d5d6c",
        maxHeight: expanded ? "none" : "60px",
        overflow: "hidden", position: "relative", marginBottom: "10px"
      }}>
        {item.content}
        {!expanded && item.content.length > 120 && (
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0, height: "30px",
            background: "linear-gradient(transparent, rgba(255,255,255,0.95))"
          }} />
        )}
      </div>

      {item.content.length > 120 && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{ fontSize: "12px", color: "#2563eb", background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: "10px" }}
        >
          {expanded ? "收起 ↑" : "展开全文 ↓"}
        </button>
      )}

      <div style={{ display: "flex", gap: "8px" }}>
        <button
          onClick={onFill}
          style={{
            padding: "6px 16px", borderRadius: "999px", fontSize: "12px",
            border: "1.5px solid #1e2a37", background: "#1e2a37", color: "#fff", cursor: "pointer"
          }}
        >
          填入编辑表单
        </button>
        <button
          onClick={() => void onSaveDirectly()}
          disabled={saving}
          style={{
            padding: "6px 16px", borderRadius: "999px", fontSize: "12px",
            border: "1.5px solid rgba(21,128,61,0.6)", background: "rgba(21,128,61,0.08)",
            color: "#15803d", cursor: saving ? "default" : "pointer", opacity: saving ? 0.6 : 1
          }}
        >
          {saving ? "保存中…" : "直接创建"}
        </button>
      </div>
    </div>
  );
}
