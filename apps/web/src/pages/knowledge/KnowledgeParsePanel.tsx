import type { FileParseState } from "./types";
import { ParseResultCard } from "./ParseResultCard";

type KnowledgeParsePanelProps = {
  parseStates: FileParseState[];
  parsingCount: number;
  savingId: string | null;
  onClose: () => void;
  onFill: (item: NonNullable<FileParseState["result"]>) => void;
  onSaveDirectly: (item: NonNullable<FileParseState["result"]>, index: number) => Promise<void>;
};

export function KnowledgeParsePanel({
  parseStates,
  parsingCount,
  savingId,
  onClose,
  onFill,
  onSaveDirectly
}: KnowledgeParsePanelProps) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h3 style={{ margin: 0, fontSize: "15px" }}>
          📄 文件解析结果
          {parsingCount > 0 && <span style={{ marginLeft: "8px", fontSize: "12px", color: "#2563eb" }}>解析中…</span>}
        </h3>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", fontSize: "16px", color: "#9aa5b4" }}
          aria-label="关闭解析面板"
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
          const result = state.result;
          const key = `${i}-${result.fileName}`;
          return (
            <ParseResultCard
              key={i}
              item={result}
              onFill={() => onFill(result)}
              onSaveDirectly={() => onSaveDirectly(result, i)}
              saving={savingId === key}
            />
          );
        })}
      </div>
    </div>
  );
}
