import React from "react";
import type { TaxItem } from "@finance-taxation/domain-model";
import { useI18n, TAX_STATUS_LABELS } from "../../lib/i18n";
import { cellStyle, panelStyle } from "./taxStyles";

export function TaxItemsPanel({
  items,
  navEventId,
  navTaxItemId
}: {
  items: TaxItem[];
  navEventId: string | null;
  navTaxItemId: string | null;
}) {
  const { t } = useI18n();

  return (
    <article style={panelStyle()}>
      <div style={{ display: "grid", gap: "12px" }}>
        <div>
          <h3 style={{ margin: 0 }}>税务事项池</h3>
          <p style={{ margin: "8px 0 0", color: "#5c6b7a", lineHeight: 1.7 }}>
            先确认事项状态和处理意见，再进入右侧申报批次完成校验、复核、申报与留档。
          </p>
        </div>
        {(navEventId || navTaxItemId) && (
          <div style={{ padding: "10px 14px", borderRadius: "10px", background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.2)", color: "#2563eb", fontSize: "13px" }}>
            {navEventId
              ? <>当前仅显示事项 <strong>{navEventId}</strong> 的关联税务事项。</>
              : <>当前高亮税务事项 <strong>{navTaxItemId}</strong>。</>}
          </div>
        )}
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={cellStyle()}>编号</th>
              <th style={cellStyle()}>税种</th>
              <th style={cellStyle()}>申报期</th>
              <th style={cellStyle()}>状态</th>
              <th style={cellStyle()}>事项</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} style={{ background: navTaxItemId === item.id ? "rgba(37,99,235,0.08)" : "transparent" }}>
                <td style={cellStyle()}>{item.id}</td>
                <td style={cellStyle()}>{item.taxType}</td>
                <td style={cellStyle()}>{item.filingPeriod}</td>
                <td style={cellStyle()}>{t(TAX_STATUS_LABELS, item.status)}</td>
                <td style={cellStyle()}>{item.treatment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
