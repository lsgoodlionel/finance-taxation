import React from "react";
import type { Voucher } from "@finance-taxation/domain-model";
import { DataTableShell } from "../../components/ui/DataTableShell";

type ExportVouchersPanelProps = {
  vouchers: Voucher[];
  selectedIds: string[];
  onToggleSelection: (id: string) => void;
  onBatchOpen: () => void;
  onOpenVoucher: (id: string) => void;
  buildFileName: (voucher: Voucher) => string;
  cellStyle: () => {
    borderBottom: string;
    padding: string;
    textAlign: "left";
  };
  batchButtonStyle: React.CSSProperties;
};

export function ExportVouchersPanel({
  vouchers,
  selectedIds,
  onToggleSelection,
  onBatchOpen,
  onOpenVoucher,
  buildFileName,
  cellStyle,
  batchButtonStyle
}: ExportVouchersPanelProps) {
  return (
    <DataTableShell
      title="凭证导出（最近 50 条）"
      actions={(
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <span style={{ fontSize: "12px", color: "#6c7a89" }}>已选 {selectedIds.length} 项</span>
          <button disabled={selectedIds.length === 0} onClick={onBatchOpen} style={{ ...batchButtonStyle, opacity: selectedIds.length ? 1 : 0.5 }}>
            批量打开
          </button>
        </div>
      )}
    >
      {vouchers.length === 0 ? (
        <div style={{ color: "#aab5c0", textAlign: "center", padding: "32px" }}>暂无凭证数据</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ color: "#6c7a89" }}>
              {["选择", "凭证编号", "类型", "摘要", "状态", "建议文件名", "操作"].map((h) => (
                <th key={h} style={{ ...cellStyle(), fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vouchers.map((voucher) => (
              <tr key={voucher.id}>
                <td style={cellStyle()}>
                  <input type="checkbox" checked={selectedIds.includes(voucher.id)} onChange={() => onToggleSelection(voucher.id)} />
                </td>
                <td style={cellStyle()}>{voucher.id.slice(-8).toUpperCase()}</td>
                <td style={cellStyle()}>{voucher.voucherType}</td>
                <td style={cellStyle()}>{voucher.summary}</td>
                <td style={cellStyle()}>{voucher.status}</td>
                <td style={cellStyle()}>{buildFileName(voucher)}</td>
                <td style={cellStyle()}>
                  <button onClick={() => onOpenVoucher(voucher.id)} style={{ ...batchButtonStyle, opacity: 1 }}>
                    导出 PDF
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
