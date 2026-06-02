import type { GeneratedDocument, Voucher } from "@finance-taxation/domain-model";
import { useI18n, DOC_STATUS_LABELS, DOC_TYPE_LABELS } from "../../lib/i18n";
import { EmptyState } from "../../components/ui/EmptyState";
import { STATUS_COLOR, shortId } from "./documents-helpers";

type DocumentsListProps = {
  documents: GeneratedDocument[];
  vouchers: Voucher[];
  selectedDocumentId: string | null;
  onSelect: (docId: string) => void;
};

function cellStyle() {
  return {
    borderBottom: "1px solid rgba(20,40,60,0.08)",
    padding: "10px 8px",
    textAlign: "left" as const,
    verticalAlign: "top" as const
  };
}

export function DocumentsList({ documents, vouchers, selectedDocumentId, onSelect }: DocumentsListProps) {
  const { t } = useI18n();

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      <h3 style={{ margin: 0, fontSize: "16px" }}>单据列表</h3>
      {documents.length === 0 ? (
        <EmptyState title="暂无单据数据" description="经营事项分析或任务执行后会在此生成单据。" />
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ color: "#6c7a89" }}>
              {["名称", "类型", "关联事项", "凭证", "状态", "附件"].map((h) => (
                <th key={h} style={{ ...cellStyle(), fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {documents.map((item) => {
              const rowRelatedVouchers = vouchers.filter((v) => v.businessEventId === item.businessEventId);
              const selected = item.id === selectedDocumentId;
              return (
                <tr
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                  style={{ cursor: "pointer", background: selected ? "rgba(30,42,55,0.06)" : "transparent" }}
                >
                  <td style={cellStyle()}>
                    <div style={{ fontWeight: selected ? 600 : 400 }}>{item.title}</div>
                    <div style={{ fontSize: "11px", color: "#9aa5b4", marginTop: "2px" }}>
                      {new Date(item.createdAt).toLocaleDateString("zh-CN")}
                    </div>
                  </td>
                  <td style={cellStyle()}>{t(DOC_TYPE_LABELS, item.documentType)}</td>
                  <td style={cellStyle()}>
                    {item.businessEventId ? (
                      <span style={{ fontFamily: "monospace", fontSize: "11px", color: "#4f8ef7", background: "rgba(79,142,247,0.08)", borderRadius: "4px", padding: "1px 5px" }}>
                        {shortId(item.businessEventId)}
                      </span>
                    ) : (
                      <span style={{ color: "#c4cdd6", fontSize: "12px" }}>—</span>
                    )}
                  </td>
                  <td style={{ ...cellStyle(), textAlign: "center" as const }}>
                    {rowRelatedVouchers.length > 0 ? (
                      <span style={{ color: "#1a7f5a", fontWeight: 600, fontSize: "12px" }}>{rowRelatedVouchers.length}张</span>
                    ) : (
                      <span style={{ color: "#c4cdd6", fontSize: "12px" }}>—</span>
                    )}
                  </td>
                  <td style={cellStyle()}>
                    <span style={{
                      background: `${STATUS_COLOR[item.status] ?? "#8a9bb0"}22`,
                      color: STATUS_COLOR[item.status] ?? "#8a9bb0",
                      borderRadius: "999px", padding: "2px 8px", fontSize: "12px"
                    }}>
                      {t(DOC_STATUS_LABELS, item.status)}
                    </span>
                  </td>
                  <td style={{ ...cellStyle(), textAlign: "center" as const }}>
                    {item.attachmentIds.length > 0 ? (
                      <span style={{ color: "#1a7f5a", fontWeight: 600 }}>{item.attachmentIds.length}</span>
                    ) : (
                      <span style={{ color: "#d97706", fontSize: "12px" }}>待上传</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
