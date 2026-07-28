/**
 * 企业制度库（V10 车道 B2：按任务重组）。
 *
 * 改造前首屏 7 个平级区块：页头（含两个入口按钮）、概览统计、筛选条、解析结果面板、
 * 录入表单、条目列表、右侧「AI 引用说明」。「上传制度文件」「手工录入」「翻查条目」
 * 是三件互不相干的事，却同屏抢位置。
 *
 * 改造后：三件事进 TaskFocusShell（见 knowledge/knowledge-tasks.ts），一次只渲染
 * 一件事的工作区；概览统计与说明收缩成随任务变化的 aside；选中的任务写在 ?task= 里。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { KnowledgeItem } from "@finance-taxation/domain-model";
import { TaskFocusShell } from "../components/ui/TaskFocusShell";
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
import {
  buildKnowledgeTasks,
  readKnowledgeTask,
  writeKnowledgeTask,
  isKnowledgeTaskKey,
  type KnowledgeTaskKey
} from "./knowledge/knowledge-tasks";
import { KnowledgeShell } from "./knowledge/KnowledgeShell";
import { KnowledgeHeader } from "./knowledge/KnowledgeHeader";
import { KnowledgeFilters } from "./knowledge/KnowledgeFilters";
import { KnowledgeForm } from "./knowledge/KnowledgeForm";
import { KnowledgeList } from "./knowledge/KnowledgeList";
import { KnowledgeImportPanel } from "./knowledge/KnowledgeImportPanel";
import { KnowledgeContextPanel } from "./knowledge/KnowledgeContextPanel";

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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parseStates, setParseStates] = useState<FileParseState[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const activeTask = readKnowledgeTask(searchParams);
  const tasks = useMemo(() => buildKnowledgeTasks({ parseStates }), [parseStates]);

  /** 切到某件事；不带 replace，用户能用浏览器后退回到上一件事。 */
  function goToTask(task: KnowledgeTaskKey) {
    setSearchParams(writeKnowledgeTask(searchParams, task));
  }

  /**
   * 用户手动点切换器。点进「手工录入一条」意味着「我要新写一条」，
   * 因此清空表单——否则上次编辑到一半的旧条目会静默地跟过来，用户以为在新建，
   * 实际保存的是对旧条目的修改。程序化跳转（编辑既有条目、从解析结果填入）
   * 走 goToTask，不经过这里，表单内容得以保留。
   */
  function handleSelectTask(key: string) {
    if (!isKnowledgeTaskKey(key)) return;
    if (key === "create") {
      setEditingId(null);
      setForm(BLANK_FORM);
    }
    goToTask(key);
  }

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
      await refresh();
      // 存完这一条，下一步多半是回列表确认它在不在——直接把用户送回去。
      goToTask("browse");
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
    goToTask("create");
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(BLANK_FORM);
    goToTask("browse");
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
    goToTask("create");
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
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  const parsingCount = parseStates.filter((s) => s.status === "parsing").length;
  const summary = buildKnowledgeSummary(items);
  const activeTaskLabel = tasks.find((task) => task.key === activeTask)?.label ?? "";

  function renderWorkspace() {
    if (activeTask === "create") {
      return (
        <KnowledgeForm
          form={form}
          editing={editingId !== null}
          onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
          onSave={() => void handleSave()}
          onCancel={cancelEdit}
        />
      );
    }

    if (activeTask === "import") {
      return (
        <KnowledgeImportPanel
          fileInputRef={fileInputRef}
          parseStates={parseStates}
          parsingCount={parsingCount}
          savingId={savingId}
          onFilesSelected={(files) => void handleFileSelect(files)}
          onClear={() => setParseStates([])}
          onFill={fillFormFromParsed}
          onSaveDirectly={saveDirectly}
        />
      );
    }

    return (
      <>
        <KnowledgeFilters
          filterCategory={filterCategory}
          searchQ={searchQ}
          onSelectCategory={handleSelectCategory}
          onSearchChange={setSearchQ}
          onSearch={handleSearch}
        />
        <KnowledgeList
          items={items}
          total={total}
          expandedId={expandedId}
          onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
          onEdit={startEdit}
          onToggleActive={(item) => void handleToggleActive(item)}
          onDelete={(item) => void handleDelete(item)}
        />
      </>
    );
  }

  return (
    <>
      <KnowledgeShell header={<KnowledgeHeader activeTaskLabel={activeTaskLabel} />}>
        <TaskFocusShell
          tasks={tasks}
          activeKey={activeTask}
          onSelectTask={handleSelectTask}
          switcherLabel="制度库能办的事"
          aside={<KnowledgeContextPanel task={activeTask} summary={summary} message={message} />}
        >
          {renderWorkspace()}
        </TaskFocusShell>
      </KnowledgeShell>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
