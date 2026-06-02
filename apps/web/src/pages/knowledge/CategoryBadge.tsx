import { CATEGORY_COLORS, categoryLabel } from "./types";

export function CategoryBadge({ category }: { category: string }) {
  return (
    <span style={{
      padding: "2px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: 500,
      color: "#fff", background: CATEGORY_COLORS[category] ?? "#6c7a89"
    }}>
      {categoryLabel(category)}
    </span>
  );
}
