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
import { buildKnowledgeSummary, parseTags } from "./knowledge/knowledge-helpers";
import {
  BLANK_FORM,
  type Category,
  type FileParseState,
  type KnowledgeForm as KnowledgeFormData
} from "./knowledge/types";
import { KnowledgeShell } from "./knowledge/KnowledgeShell";
import { KnowledgeHeader } from "./knowledge/KnowledgeHeader";
import { KnowledgeSummary } from "./knowledge/KnowledgeSummary";
import { KnowledgeFilters } from "./knowledge/KnowledgeFilters";
import { KnowledgeForm } from "./knowledge/KnowledgeForm";
import { KnowledgeList } from "./knowledge/KnowledgeList";
import { KnowledgeParsePanel } from "./knowledge/KnowledgeParsePanel";
import { KnowledgeAside } from "./knowledge/KnowledgeAside";

const MAX_FILE_SIZE = 20 * 1024 * 1024;

export function KnowledgePage() {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [filterCategory, setFilterCategory] = useState<Category | "">("");
  const [searchQ, setSearchQ] = useState("");
  const [message, setMessage] = useState("正在加载企业制度库。");
  const [form, setForm] = useState<KnowledgeFormData>(BLANK_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

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

  function handleSelectCategory(category: Category | "") {
    setFilterCategory(category);
    void refresh(category, searchQ).catch((e) => setMessage((e as Error).message));
  }

  function handleSearch() {
    void refresh(filterCategory, searchQ).catch((e) => setMessage((e as Error).message));
  }

  async function handleSave() {
    if (!form.title.trim() || !form.content.trim()) {
      setMessage("标题和内容为必填项。");
      return;
    }
    const tags = parseTags(form.tags);
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

  function toggleForm() {
    setShowForm((prev) => !prev);
    setEditingId(null);
    setForm(BLANK_FORM);
  }

  async function handleFileSelect(files: FileList) {
    const fileArr = Array.from(files);
    if (fileArr.length === 0) return;

    const valid = fileArr.filter((f) => {
      const lower = f.name.toLowerCase();
      const ok = lower.endsWith(".pdf") || lower.endsWith(".docx") || lower.endsWith(".doc");
      if (!ok) { setMessage(`文件「${f.name}」格式不支持，仅支持 PDF 和 Word`); }
      if (f.size > MAX_FILE_SIZE) { setMessage(`文件「${f.name}」超过 20MB 限制`); return false; }
      return ok;
    });
    if (valid.length === 0) return;

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
          category: "policy",
          content: "",
          tags: [],
          error: errMsg
        };
        newEntry = { file, status: "error", result: errorItem, error: errMsg };
      }
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
  const summary = buildKnowledgeSummary(items);

  return (
    <>
      <KnowledgeShell
        header={(
          <KnowledgeHeader
            fileInputRef={fileInputRef}
            parsingCount={parsingCount}
            showForm={showForm}
            onFilesSelected={(files) => void handleFileSelect(files)}
            onToggleForm={toggleForm}
          />
        )}
        summary={<KnowledgeSummary summary={summary} message={message} />}
        filters={(
          <KnowledgeFilters
            filterCategory={filterCategory}
            searchQ={searchQ}
            onSelectCategory={handleSelectCategory}
            onSearchChange={setSearchQ}
            onSearch={handleSearch}
          />
        )}
        parsePanel={showParsePanel && parseStates.length > 0 ? (
          <KnowledgeParsePanel
            parseStates={parseStates}
            parsingCount={parsingCount}
            savingId={savingId}
            onClose={() => setShowParsePanel(false)}
            onFill={fillFormFromParsed}
            onSaveDirectly={saveDirectly}
          />
        ) : undefined}
        form={showForm ? (
          <KnowledgeForm
            form={form}
            editing={editingId !== null}
            onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
            onSave={() => void handleSave()}
            onCancel={toggleForm}
          />
        ) : undefined}
        list={(
          <KnowledgeList
            items={items}
            total={total}
            expandedId={expandedId}
            onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
            onEdit={startEdit}
            onToggleActive={(item) => void handleToggleActive(item)}
            onDelete={(item) => void handleDelete(item)}
          />
        )}
        aside={<KnowledgeAside />}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
