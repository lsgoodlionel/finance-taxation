import { useEffect, useRef, useState } from "react";
import type { KnowledgeItem } from "@finance-taxation/domain-model";
import {
  createKnowledgeItem,
  deleteKnowledgeItem,
  listKnowledgeItems,
  parseKnowledgeDocuments,
  updateKnowledgeItem,
  type ParsedKnowledgeItem
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

interface FileParseState {
  file: File;
  status: "pending" | "parsing" | "done" | "error";
  result?: ParsedKnowledgeItem;
  error?: string;
}

function CategoryBadge({ category }: { category: string }) {
  const label = CATEGORIES.find((c) => c.value === category)?.label ?? category;
  return (
    <span style={{
      padding: "2px 10px", borderRadius: "999px", fontSize: "12px", fontWeight: 500,
      color: "#fff", background: CATEGORY_COLORS[category] ?? "#6c7a89"
    }}>
      {label}
    </span>
  );
}

function ParseResultCard({
  item,
  onFill,
  onSaveDirectly,
  saving
}: {
  item: ParsedKnowledgeItem;
  onFill: () => void;
  onSaveDirectly: () => Promise<void>;
  saving: boolean;
}) {
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

      <div
        style={{
          fontSize: "13px", lineHeight: 1.7, color: "#4d5d6c",
          maxHeight: expanded ? "none" : "60px",
          overflow: "hidden",
          position: "relative",
          marginBottom: "10px"
        }}
      >
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
            border: "1.5px solid #1e2a37", background: "#1e2a37",
            color: "#fff", cursor: "pointer"
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

  // File import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parseStates, setParseStates] = useState<FileParseState[]>([]);
  const [showParsePanel, setShowParsePanel] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
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

  async function handleFileSelect(files: FileList) {
    const fileArr = Array.from(files);
    if (fileArr.length === 0) return;

    const MAX_SIZE = 20 * 1024 * 1024;
    const valid = fileArr.filter((f) => {
      const lower = f.name.toLowerCase();
      const ok = lower.endsWith(".pdf") || lower.endsWith(".docx") || lower.endsWith(".doc");
      if (!ok) { setMessage(`文件「${f.name}」格式不支持，仅支持 PDF 和 Word`); }
      if (f.size > MAX_SIZE) { setMessage(`文件「${f.name}」超过 20MB 限制`); return false; }
      return ok;
    });

    if (valid.length === 0) return;

    // Initialize all as "parsing", then process one by one
    let currentStates: FileParseState[] = valid.map((f) => ({ file: f, status: "parsing" as const }));
    setParseStates(currentStates);
    setShowParsePanel(true);
    setMessage(`正在解析 ${valid.length} 个文件，请稍候…`);

    let successCount = 0;
    for (let i = 0; i < valid.length; i++) {
      const file = valid[i]!;
      let newEntry: FileParseState;
      try {
        const result = await parseKnowledgeDocuments([file]);
        const item = result.items[0];
        if (!item) throw new Error("服务器未返回解析结果");
        const ok = !item.error;
        if (ok) successCount++;
        newEntry = { file, status: ok ? "done" : "error", result: item, error: item.error };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const errorItem: ParsedKnowledgeItem = {
          fileName: file.name,
          title: file.name.replace(/\.[^.]+$/, ""),
          category: "policy" as const,
          content: "",
          tags: [],
          error: errMsg
        };
        newEntry = { file, status: "error", result: errorItem, error: errMsg };
      }
      // Update local array then set state with full snapshot — avoids React batching issues
      currentStates = currentStates.map((s, idx) => (idx === i ? newEntry : s));
      setParseStates([...currentStates]);
      setMessage(`已完成 ${i + 1} / ${valid.length} 个文件…`);
    }

    setMessage(`解析完成：${successCount} 个成功，${valid.length - successCount} 个失败。`);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function fillFormFromParsed(item: ParsedKnowledgeItem) {
    setForm({
      category: item.category,
      title: item.title,
      content: item.content,
      tags: item.tags.join(", ")
    });
    setEditingId(null);
    setShowForm(true);
    setShowParsePanel(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveDirectly(item: ParsedKnowledgeItem, stateIndex: number) {
    const key = `${stateIndex}-${item.fileName}`;
    setSavingId(key);
    try {
      await createKnowledgeItem({
        category: item.category,
        title: item.title,
        content: item.content,
        tags: item.tags
      });
      setMessage(`已创建条目「${item.title}」。`);
      await refresh();
      setParseStates((prev) => prev.filter((_, i) => i !== stateIndex));
      if (parseStates.length <= 1) setShowParsePanel(false);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  const parsingCount = parseStates.filter((s) => s.status === "parsing").length;

  return (
    <section style={{ display: "grid", gap: "20px" }}>
      <article style={panelStyle()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: "0 0 4px" }}>企业制度库</h2>
            <p style={{ margin: 0, color: "#6c7a89", fontSize: "14px" }}>{message}</p>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <label style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              padding: "10px 18px", borderRadius: "999px",
              border: "1.5px solid rgba(37,99,235,0.5)", background: "rgba(37,99,235,0.06)",
              color: "#1d4ed8", cursor: parsingCount > 0 ? "default" : "pointer",
              fontSize: "14px", fontWeight: 500, opacity: parsingCount > 0 ? 0.6 : 1
            }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.doc"
                multiple
                style={{ display: "none" }}
                disabled={parsingCount > 0}
                onChange={(e) => { if (e.target.files?.length) void handleFileSelect(e.target.files); }}
              />
              {parsingCount > 0 ? `解析中…(${parsingCount})` : "📄 从文件导入"}
            </label>
            <button
              onClick={() => { setShowForm(!showForm); setEditingId(null); setForm(BLANK_FORM); }}
              style={{ padding: "10px 20px", borderRadius: "999px", background: "#1e2a37", color: "#fff", border: "none", cursor: "pointer" }}
            >
              {showForm ? "取消" : "+ 新增条目"}
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "16px", flexWrap: "wrap", alignItems: "center" }}>
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              onClick={() => { setFilterCategory(c.value as Category | ""); void refresh(c.value as Category | "", searchQ); }}
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

      {/* 文件解析结果面板 */}
      {showParsePanel && parseStates.length > 0 && (
        <article style={{ ...panelStyle(), border: "1.5px solid rgba(37,99,235,0.25)", background: "rgba(239,246,255,0.7)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h3 style={{ margin: 0, fontSize: "15px" }}>
              📄 文件解析结果
              {parsingCount > 0 && <span style={{ marginLeft: "8px", fontSize: "12px", color: "#2563eb" }}>解析中…</span>}
            </h3>
            <button
              onClick={() => setShowParsePanel(false)}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px", color: "#9aa5b4" }}
            >
              ✕
            </button>
          </div>

          <div style={{ fontSize: "12.5px", color: "#4d5d6c", marginBottom: "14px", lineHeight: 1.6 }}>
            AI 已自动识别文件内容并提取关键信息。点击「填入编辑表单」可进一步修改后保存，或点击「直接创建」立即录入制度库。
          </div>

          <div style={{ display: "grid", gap: "12px" }}>
            {parseStates.map((state, i) => {
              if (state.status === "parsing") {
                return (
                  <div key={i} style={{
                    borderRadius: "12px", border: "1px solid rgba(20,40,60,0.1)",
                    padding: "16px", background: "rgba(255,255,255,0.8)",
                    display: "flex", alignItems: "center", gap: "10px"
                  }}>
                    <div style={{
                      width: "18px", height: "18px", borderRadius: "50%",
                      border: "2.5px solid #2563eb", borderTopColor: "transparent",
                      animation: "spin 0.8s linear infinite", flexShrink: 0
                    }} />
                    <span style={{ fontSize: "13px", color: "#4d5d6c" }}>正在解析 {state.file.name}…</span>
                  </div>
                );
              }
              if (!state.result) return null;
              const key = `${i}-${state.result.fileName}`;
              return (
                <ParseResultCard
                  key={i}
                  item={state.result}
                  onFill={() => fillFormFromParsed(state.result!)}
                  onSaveDirectly={() => saveDirectly(state.result!, i)}
                  saving={savingId === key}
                />
              );
            })}
          </div>
        </article>
      )}

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
          <p style={{ color: "#6c7a89" }}>暂无条目。点击「新增条目」添加企业制度，或点击「从文件导入」批量上传 PDF / Word 文档。</p>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {items.map((item) => (
              <div
                key={item.id}
                style={{
                  borderRadius: "12px", border: "1px solid rgba(20,40,60,0.08)",
                  padding: "14px 16px",
                  background: item.isActive ? "rgba(255,255,255,0.9)" : "rgba(230,230,230,0.5)",
                  opacity: item.isActive ? 1 : 0.7
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                  <CategoryBadge category={item.category} />
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
          <br />
          支持从 <strong>PDF、Word（.docx/.doc）</strong> 文件批量导入，AI 自动识别标题、分类、摘要和标签。
        </p>
      </article>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </section>
  );
}
