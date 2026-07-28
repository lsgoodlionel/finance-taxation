import { type RefObject } from "react";
import { EmptyState } from "../../components/ui/EmptyState";
import { KnowledgeParsePanel } from "./KnowledgeParsePanel";
import type { FileParseState } from "./types";

type KnowledgeImportPanelProps = {
  fileInputRef: RefObject<HTMLInputElement>;
  parseStates: FileParseState[];
  parsingCount: number;
  savingId: string | null;
  onFilesSelected: (files: FileList) => void;
  onClear: () => void;
  onFill: (item: NonNullable<FileParseState["result"]>) => void;
  onSaveDirectly: (item: NonNullable<FileParseState["result"]>, index: number) => Promise<void>;
};

const PICKER_STYLE = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  padding: "10px 18px",
  borderRadius: "999px",
  border: "1.5px solid rgba(37,99,235,0.5)",
  background: "rgba(37,99,235,0.06)",
  color: "#1d4ed8",
  fontSize: "14px",
  fontWeight: 500
} as const;

/**
 * 「从文件导入制度」这件事的完整工作区：选文件 → 看解析结果 → 逐条入库。
 *
 * 改造前这两步被拆在两个地方——文件选择器常驻页头（在别的任务上方也一直在），
 * 解析结果是一块会突然插进页面中部的面板。现在它们在同一件事里前后相接，
 * 用户从「挑文件」到「确认入库」不用在页面上找第二个落点。
 */
export function KnowledgeImportPanel({
  fileInputRef,
  parseStates,
  parsingCount,
  savingId,
  onFilesSelected,
  onClear,
  onFill,
  onSaveDirectly
}: KnowledgeImportPanelProps) {
  const importing = parsingCount > 0;

  return (
    <div style={{ display: "grid", gap: "16px" }}>
      <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ ...PICKER_STYLE, cursor: importing ? "default" : "pointer", opacity: importing ? 0.6 : 1 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.doc"
            multiple
            style={{ display: "none" }}
            disabled={importing}
            onChange={(e) => { if (e.target.files?.length) onFilesSelected(e.target.files); }}
          />
          {importing ? `解析中…(${parsingCount})` : "📄 选择 PDF / Word 文件"}
        </label>
        <span style={{ fontSize: "13px", color: "#6c7a89" }}>
          可一次选多个文件，单个不超过 20MB，仅支持 PDF 与 Word（.pdf / .docx / .doc）。
        </span>
      </div>

      {parseStates.length === 0 ? (
        <EmptyState
          title="还没有待入库的解析结果"
          description="先选几个制度文件，AI 会逐个读出标题、分类、摘要和标签，再由你逐条确认入库。"
        />
      ) : (
        <KnowledgeParsePanel
          parseStates={parseStates}
          parsingCount={parsingCount}
          savingId={savingId}
          onClose={onClear}
          onFill={onFill}
          onSaveDirectly={onSaveDirectly}
        />
      )}
    </div>
  );
}
