import React from "react";
import type { ExportArchiveEntry, ExportArtifactKind } from "@finance-taxation/domain-model";
import { DataTableShell } from "../../components/ui/DataTableShell";

type ExportArchivePanelProps = {
  archiveEntries: ExportArchiveEntry[];
  archiveKindFilter: ExportArtifactKind | "";
  archiveKeyword: string;
  onKindFilterChange: (value: ExportArtifactKind | "") => void;
  onKeywordChange: (value: string) => void;
  cellStyle: () => {
    borderBottom: string;
    padding: string;
    textAlign: "left";
  };
};

export function ExportArchivePanel({
  archiveEntries,
  archiveKindFilter,
  archiveKeyword,
  onKindFilterChange,
  onKeywordChange,
  cellStyle
}: ExportArchivePanelProps) {
  return (
    <DataTableShell
      title="导出归档索引"
      actions={(
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <select value={archiveKindFilter} onChange={(event) => onKindFilterChange(event.target.value as ExportArtifactKind | "")} style={{ padding: "6px 10px", borderRadius: "8px", border: "1px solid rgba(20,40,60,0.15)", fontSize: "12px" }}>
            <option value="">全部分类</option>
            <option value="report">报表</option>
            <option value="tax">税务</option>
            <option value="package">资料包</option>
            <option value="document">单据</option>
            <option value="risk">风险</option>
            <option value="rnd">研发</option>
            <option value="payroll">工资</option>
            <option value="voucher">凭证</option>
          </select>
          <input
            value={archiveKeyword}
            onChange={(event) => onKeywordChange(event.target.value)}
            placeholder="搜索标题/文件名/归档键"
            style={{ padding: "6px 10px", borderRadius: "8px", border: "1px solid rgba(20,40,60,0.15)", fontSize: "12px", minWidth: "220px" }}
          />
        </div>
      )}
    >
      {archiveEntries.length === 0 ? (
        <div style={{ color: "#aab5c0", textAlign: "center", padding: "24px" }}>暂无归档索引</div>
      ) : (
        <div style={{ display: "grid", gap: "16px" }}>
          {Object.values(
            archiveEntries.reduce<Record<string, ExportArchiveEntry[]>>((groups, entry) => {
              const batchNo = entry.archiveKey.split(":")[0] ?? entry.archiveKey;
              groups[batchNo] = groups[batchNo] ?? [];
              groups[batchNo].push(entry);
              return groups;
            }, {})
          ).map((items) => {
            const batchNo = items[0]!.archiveKey.split(":")[0];
            return (
              <div key={batchNo} style={{ border: "1px solid rgba(20,40,60,0.08)", borderRadius: "14px", overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", background: "rgba(20,40,60,0.04)", fontSize: "12px", fontWeight: 700, color: "#4d5d6c" }}>
                  批次号：{batchNo} · 共 {items.length} 项
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ color: "#6c7a89" }}>
                      {["归档键", "分类", "标题", "对象", "建议文件名", "时间"].map((h) => (
                        <th key={h} style={{ ...cellStyle(), fontWeight: 500 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td style={cellStyle()}>{item.archiveKey}</td>
                        <td style={cellStyle()}>{item.kind}</td>
                        <td style={cellStyle()}>{item.title}</td>
                        <td style={cellStyle()}>{item.objectId || item.objectType}</td>
                        <td style={cellStyle()}>{item.fileName}</td>
                        <td style={cellStyle()}>{new Date(item.createdAt).toLocaleString("zh-CN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </DataTableShell>
  );
}
