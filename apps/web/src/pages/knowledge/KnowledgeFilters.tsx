import { CATEGORIES, type Category } from "./types";

type KnowledgeFiltersProps = {
  filterCategory: Category | "";
  searchQ: string;
  onSelectCategory: (category: Category | "") => void;
  onSearchChange: (value: string) => void;
  onSearch: () => void;
};

export function KnowledgeFilters({
  filterCategory,
  searchQ,
  onSelectCategory,
  onSearchChange,
  onSearch
}: KnowledgeFiltersProps) {
  return (
    <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
      {CATEGORIES.map((c) => (
        <button
          key={c.value}
          onClick={() => onSelectCategory(c.value as Category | "")}
          style={{
            padding: "6px 16px", borderRadius: "999px",
            border: "1px solid rgba(20,40,60,0.1)",
            background: filterCategory === c.value ? "#1e2a37" : "rgba(255,255,255,0.8)",
            color: filterCategory === c.value ? "#fff" : "#1e2a37",
            cursor: "pointer", fontSize: "13px"
          }}
        >
          {c.label}
        </button>
      ))}
      <div style={{ display: "flex", gap: "8px", marginLeft: "auto" }}>
        <input
          value={searchQ}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch()}
          placeholder="搜索标题/内容…"
          style={{ padding: "8px 14px", borderRadius: "999px", border: "1px solid rgba(20,40,60,0.15)", fontSize: "14px", width: "200px" }}
        />
        <button onClick={onSearch} style={{ padding: "8px 16px", borderRadius: "999px", border: "1px solid rgba(20,40,60,0.15)", cursor: "pointer" }}>
          搜索
        </button>
      </div>
    </div>
  );
}
