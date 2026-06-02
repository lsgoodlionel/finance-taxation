import { type RefObject } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { buildResultPageSubtitle } from "../../lib/entry-guidance";

type KnowledgeHeaderProps = {
  fileInputRef: RefObject<HTMLInputElement>;
  parsingCount: number;
  showForm: boolean;
  onFilesSelected: (files: FileList) => void;
  onToggleForm: () => void;
};

export function KnowledgeHeader({
  fileInputRef,
  parsingCount,
  showForm,
  onFilesSelected,
  onToggleForm
}: KnowledgeHeaderProps) {
  const importing = parsingCount > 0;
  return (
    <div style={{ display: "grid", gap: "10px" }}>
      <PageHeader
        title="企业制度库"
        subtitle={buildResultPageSubtitle("制度库")}
        actions={(
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <label style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              padding: "10px 18px", borderRadius: "999px",
              border: "1.5px solid rgba(37,99,235,0.5)", background: "rgba(37,99,235,0.06)",
              color: "#1d4ed8", cursor: importing ? "default" : "pointer",
              fontSize: "14px", fontWeight: 500, opacity: importing ? 0.6 : 1
            }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.doc"
                multiple
                style={{ display: "none" }}
                disabled={importing}
                onChange={(e) => { if (e.target.files?.length) onFilesSelected(e.target.files); }}
              />
              {importing ? `解析中…(${parsingCount})` : "📄 从文件导入"}
            </label>
            <button
              onClick={onToggleForm}
              style={{ padding: "10px 20px", borderRadius: "999px", background: "#1e2a37", color: "#fff", border: "none", cursor: "pointer" }}
            >
              {showForm ? "取消" : "+ 新增条目"}
            </button>
          </div>
        )}
      />
      <div className="v3-banner" data-tone="info" style={{ fontSize: "13px" }}>
        启用中的条目会被「AI 财税秘书」自动检索引用。先看分类分布与启用情况，再决定新增、导入或停用条目。
      </div>
    </div>
  );
}
