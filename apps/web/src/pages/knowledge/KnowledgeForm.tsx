import { CATEGORIES, type Category, type KnowledgeForm as KnowledgeFormData } from "./types";

type KnowledgeFormProps = {
  form: KnowledgeFormData;
  editing: boolean;
  onChange: (patch: Partial<KnowledgeFormData>) => void;
  onSave: () => void;
  onCancel: () => void;
};

const labelStyle = { fontSize: "13px", color: "#6c7a89", display: "block", marginBottom: "4px" } as const;
const inputStyle = { width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(20,40,60,0.15)", boxSizing: "border-box" } as const;

export function KnowledgeForm({ form, editing, onChange, onSave, onCancel }: KnowledgeFormProps) {
  return (
    <div style={{ display: "grid", gap: "12px" }}>
      <h3 style={{ marginTop: 0 }}>{editing ? "编辑条目" : "新增条目"}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "12px" }}>
        <div>
          <label style={labelStyle}>分类</label>
          <select
            value={form.category}
            onChange={(e) => onChange({ category: e.target.value as Category })}
            style={{ ...inputStyle, padding: "8px 12px" }}
          >
            {CATEGORIES.slice(1).map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={labelStyle}>标题</label>
          <input
            value={form.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="条目标题"
            style={inputStyle}
          />
        </div>
      </div>
      <div>
        <label style={labelStyle}>内容</label>
        <textarea
          value={form.content}
          onChange={(e) => onChange({ content: e.target.value })}
          placeholder="条目详细内容（将被 AI 财税秘书引用）"
          rows={6}
          style={{ ...inputStyle, padding: "10px 12px", resize: "vertical", fontFamily: "inherit", fontSize: "14px" }}
        />
      </div>
      <div>
        <label style={labelStyle}>标签（逗号分隔）</label>
        <input
          value={form.tags}
          onChange={(e) => onChange({ tags: e.target.value })}
          placeholder="增值税, 小规模, 2024"
          style={inputStyle}
        />
      </div>
      <div style={{ display: "flex", gap: "10px" }}>
        <button
          onClick={onSave}
          style={{ padding: "10px 24px", borderRadius: "999px", background: "#1e2a37", color: "#fff", border: "none", cursor: "pointer" }}
        >
          {editing ? "保存修改" : "创建条目"}
        </button>
        <button
          onClick={onCancel}
          style={{ padding: "10px 20px", borderRadius: "999px", border: "1px solid rgba(20,40,60,0.15)", cursor: "pointer" }}
        >
          取消
        </button>
      </div>
    </div>
  );
}
