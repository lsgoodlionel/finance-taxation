import { useEffect, useState } from "react";
import type { KnowledgeItem } from "@finance-taxation/domain-model";
import {
  createKnowledgeItem,
  deleteKnowledgeItem,
  listKnowledgeItems,
  login,
  refreshSession,
  updateKnowledgeItem
} from "../lib/api";

type Category = "regulation" | "policy" | "faq" | "template";

const CATEGORIES: { value: Category | ""; label: string }[] = [
  { value: "", label: "全部" },
  { value: "regulation", label: "法规" },
  { value: "policy", label: "制度" },
  { value: "faq", label: "问答" },
  { value: "template", label: "模板" }
];

const CATEGORY_COLORS: Record<string, string> = {
  regulation: "#1d4ed8",
  policy: "#15803d",
  faq: "#b45309",
  template: "#7c3aed"
};

function panelStyle() {
  return {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)",
    padding: "24px"
  } as const;
}

const BLANK_FORM = {
  category: "policy" as Category,
  title: "",
  content: "",
  tags: ""
};

export function KnowledgePage() {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [filterCategory, setFilterCategory] = useState<Category | "">("");
  const [searchQ, setSearchQ] = useState("");
  const [message, setMessage] = useState("正在加载企业制度库。");
  const [form, setForm] = useState(BLANK_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        await login("chairman", "123456");
        await refreshSession();
        await refresh();
      } catch (error) {
        setMessage((error as Error).message);
      }
    })();
  }, []);

  async function refresh(category?: Category | "", q?: string) {
    const cat = category !== undefined ? category : filterCategory;
    const query = q !== undefined ? q : searchQ;
    const payload = await listKnowledgeItems({ category: cat || undefined, q: query || undefined });
    setItems(payload.items);
    setTotal(payload.total);
    setMessage(`共 ${payload.total} 条制度与知识条目。`);
  }

  async function handleSearch() {
    await refresh(filterCategory, searchQ);
  }

  async function handleSave() {
    if (!form.title.trim() || !form.content.trim()) {
      setMessage("标题和内容为必填项。");
      return;
    }
    const tags = form.tags
      .split(/[,，\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      if (editingId) {
        await updateKnowledgeItem(editingId, { ...form, tags });
        setMessage(`已更新条目「${form.title}」。`);
      } else {
        await createKnowledgeItem({ ...form, tags });
        setMessage(`已新增条目「${form.title}」。`);
      }
      setForm(BLANK_FORM);
      setEditingId(null);
      setShowForm(false);
      await refresh();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  function startEdit(item: KnowledgeItem) {
    setForm({
      category: item.category,
      title: item.title,
      content: item.content,
      tags: item.tags.join(", ")
    });
    setEditingId(item.id);
    setShowForm(true);
  }

  async function handleDelete(item: KnowledgeItem) {
    if (!window.confirm(`确定删除「${item.title}」？`)) return;
    try {
      await deleteKnowledgeItem(item.id);
      setMessage(`已删除条目「${item.title}」。`);
      await refresh();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function handleToggleActive(item: KnowledgeItem) {
    try {
      await updateKnowledgeItem(item.id, { isActive: !item.isActive });
      await refresh();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  return (
    <section style={{ display: "grid", gap: "20px" }}>
      <article style={panelStyle()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ margin: "0 0 4px" }}>企业制度库</h2>
            <p style={{ margin: 0, color: "#6c7a89", fontSize: "14px" }}>{message}</p>
          </div>
          <button
            onClick={() => { setShowForm(!showForm); setEditingId(null); setForm(BLANK_FORM); }}
            style={{ padding: "10px 20px", borderRadius: "999px", background: "#1e2a37", color: "#fff", border: "none", cursor: "pointer" }}
          >
            {showForm ? "取消" : "+ 新增条目"}
          </button>
        </div>

        {/* 搜索与分类过滤 */}
        <div style={{ display: "flex", gap: "10px", marginTop: "16px", flexWrap: "wrap", alignItems: "center" }}>
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => { setFilterCategory(c.value as Category | ""); void refresh(c.value as Category | "", searchQ); }}
              style={{
                padding: "6px 16px",
                borderRadius: "999px",
                border: "1px solid rgba(20,40,60,0.1)",
                background: filterCategory === c.value ? "#1e2a37" : "rgba(255,255,255,0.8)",
                color: filterCategory === c.value ? "#fff" : "#1e2a37",
                cursor: "pointer",
                fontSize: "13px"
              }}
            >
              {c.label}
            </button>
          ))}
          <div style={{ display: "flex", gap: "8px", marginLeft: "auto" }}>
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleSearch()}
              placeholder="搜索标题/内容…"
              style={{ padding: "8px 14px", borderRadius: "999px", border: "1px solid rgba(20,40,60,0.15)", fontSize: "14px", width: "200px" }}
            />
            <button onClick={() => void handleSearch()} style={{ padding: "8px 16px", borderRadius: "999px", border: "1px solid rgba(20,40,60,0.15)", cursor: "pointer" }}>
              搜索
            </button>
          </div>
        </div>
      </article>

      {/* 新增 / 编辑表单 */}
      {showForm && (
        <article style={panelStyle()}>
          <h3 style={{ marginTop: 0 }}>{editingId ? "编辑条目" : "新增条目"}</h3>
          <div style={{ display: "grid", gap: "12px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "12px" }}>
              <div>
                <label style={{ fontSize: "13px", color: "#6c7a89", display: "block", marginBottom: "4px" }}>分类</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as Category }))}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(20,40,60,0.15)" }}
                >
                  {CATEGORIES.slice(1).map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: "13px", color: "#6c7a89", display: "block", marginBottom: "4px" }}>标题</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="条目标题"
                  style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(20,40,60,0.15)", boxSizing: "border-box" }}
                />
              </div>
            </div>
            <div>
              <label style={{ fontSize: "13px", color: "#6c7a89", display: "block", marginBottom: "4px" }}>内容</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="条目详细内容（将被 AI 财税秘书引用）"
                rows={6}
                style={{ width: "100%", padding: "10px 12px", borderRadius: "8px", border: "1px solid rgba(20,40,60,0.15)", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit", fontSize: "14px" }}
              />
            </div>
            <div>
              <label style={{ fontSize: "13px", color: "#6c7a89", display: "block", marginBottom: "4px" }}>标签（逗号分隔）</label>
              <input
                value={form.tags}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                placeholder="增值税, 小规模, 2024"
                style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(20,40,60,0.15)", boxSizing: "border-box" }}
              />
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={() => void handleSave()}
                style={{ padding: "10px 24px", borderRadius: "999px", background: "#1e2a37", color: "#fff", border: "none", cursor: "pointer" }}
              >
                {editingId ? "保存修改" : "创建条目"}
              </button>
              <button
                onClick={() => { setShowForm(false); setEditingId(null); setForm(BLANK_FORM); }}
                style={{ padding: "10px 20px", borderRadius: "999px", border: "1px solid rgba(20,40,60,0.15)", cursor: "pointer" }}
              >
                取消
              </button>
            </div>
          </div>
        </article>
      )}

      {/* 条目列表 */}
      <article style={panelStyle()}>
        <div style={{ marginBottom: "12px", color: "#6c7a89", fontSize: "13px" }}>
          显示 {items.length} / {total} 条（启用中）
        </div>
        {items.length === 0 ? (
          <p style={{ color: "#6c7a89" }}>暂无条目。点击「新增条目」添加企业制度或常见问题。</p>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {items.map((item) => (
              <div
                key={item.id}
                style={{
                  borderRadius: "12px",
                  border: "1px solid rgba(20,40,60,0.08)",
                  padding: "14px 16px",
                  background: item.isActive ? "rgba(255,255,255,0.9)" : "rgba(230,230,230,0.5)",
                  opacity: item.isActive ? 1 : 0.7
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                  <span style={{
                    padding: "2px 10px",
                    borderRadius: "999px",
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "#fff",
                    background: CATEGORY_COLORS[item.category] ?? "#6c7a89"
                  }}>
                    {CATEGORIES.find((c) => c.value === item.category)?.label ?? item.category}
                  </span>
                  <strong style={{ fontSize: "15px", flex: 1 }}>{item.title}</strong>
                  {item.tags.length > 0 && (
                    <span style={{ fontSize: "12px", color: "#6c7a89" }}>
                      {item.tags.map((t) => `#${t}`).join(" ")}
                    </span>
                  )}
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                      style={{ padding: "4px 12px", borderRadius: "999px", border: "1px solid rgba(20,40,60,0.15)", fontSize: "12px", cursor: "pointer" }}
                    >
                      {expandedId === item.id ? "收起" : "展开"}
                    </button>
                    <button
                      onClick={() => startEdit(item)}
                      style={{ padding: "4px 12px", borderRadius: "999px", border: "1px solid rgba(20,40,60,0.15)", fontSize: "12px", cursor: "pointer" }}
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => void handleToggleActive(item)}
                      style={{ padding: "4px 12px", borderRadius: "999px", border: "1px solid rgba(20,40,60,0.15)", fontSize: "12px", cursor: "pointer", color: item.isActive ? "#b45309" : "#15803d" }}
                    >
                      {item.isActive ? "停用" : "启用"}
                    </button>
                    <button
                      onClick={() => void handleDelete(item)}
                      style={{ padding: "4px 12px", borderRadius: "999px", border: "1px solid #fca5a5", fontSize: "12px", cursor: "pointer", color: "#b91c1c" }}
                    >
                      删除
                    </button>
                  </div>
                </div>
                {expandedId === item.id && (
                  <div style={{ marginTop: "10px", padding: "12px", background: "rgba(20,40,60,0.03)", borderRadius: "8px", fontSize: "14px", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                    {item.content}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </article>

      <article style={{ ...panelStyle(), background: "rgba(241,245,249,0.8)" }}>
        <h4 style={{ margin: "0 0 8px", fontSize: "13px", color: "#6c7a89" }}>AI 引用说明</h4>
        <p style={{ margin: 0, fontSize: "13px", color: "#6c7a89", lineHeight: 1.8 }}>
          启用中的条目会在「AI 财税秘书」对话时自动检索相关内容（关键词匹配，最多 5 条），
          作为制度参考注入系统上下文。建议将关键政策、公司制度、常见问答录入此处，
          以便 AI 给出更准确、符合公司口径的建议。
        </p>
      </article>
    </section>
  );
}
