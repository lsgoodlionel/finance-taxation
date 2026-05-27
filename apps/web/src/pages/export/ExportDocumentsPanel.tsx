import React from "react";
import type { GeneratedDocument } from "@finance-taxation/domain-model";
import { DataTableShell } from "../../components/ui/DataTableShell";

type ExportDocumentsPanelProps = {
  documents: GeneratedDocument[];
  selectedIds: string[];
  onToggleSelection: (id: string) => void;
  onBatchOpen: () => void;
  onOpenDocument: (document: GeneratedDocument) => void;
  buildFileName: (document: GeneratedDocument) => string;
  cellStyle: () => {
    borderBottom: string;
    padding: string;
    textAlign: "left";
  };
  batchButtonStyle: React.CSSProperties;
};

export function ExportDocumentsPanel({
  documents,
  selectedIds,
  onToggleSelection,
  onBatchOpen,
  onOpenDocument,
  buildFileName,
  cellStyle,
  batchButtonStyle
}: ExportDocumentsPanelProps) {
  return (
    <DataTableShell
      title="单据正式模板导出"
      actions={(
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span style={{ fontSize: "12px", color: "#6c7a89" }}>已选 {selectedIds.length} 项</span>
          <button disabled={selectedIds.length === 0} onClick={onBatchOpen} style={{ ...batchButtonStyle, opacity: selectedIds.length ? 1 : 0.5 }}>
            批量打开
          </button>
        </div>
      )}
    >
      {documents.length === 0 ? (
        <div style={{ color: "#aab5c0", textAlign: "center", padding: "32px" }}>暂无单据数据</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ color: "#6c7a89" }}>
              {["选择", "单据名称", "类型", "状态", "事项", "建议文件名", "操作"].map((h) => (
                <th key={h} style={{ ...cellStyle(), fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {documents.map((document) => (
              <tr key={document.id}>
                <td style={cellStyle()}>
                  <input type="checkbox" checked={selectedIds.includes(document.id)} onChange={() => onToggleSelection(document.id)} />
                </td>
                <td style={cellStyle()}>{document.title}</td>
                <td style={cellStyle()}>{document.documentType}</td>
                <td style={cellStyle()}>{document.status}</td>
                <td style={cellStyle()}>{document.businessEventId}</td>
                <td style={cellStyle()}>{buildFileName(document)}</td>
                <td style={cellStyle()}>
                  <button onClick={() => onOpenDocument(document)} style={{ ...batchButtonStyle, opacity: 1 }}>
                    打开单据模板
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </DataTableShell>
  );
}
