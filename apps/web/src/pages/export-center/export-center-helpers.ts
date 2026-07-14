import React from "react";
import { API_BASE_URL, getStoredToken } from "../../lib/api";

/** 报表类型中文标签，供报表快照卡片展示使用。 */
export const REPORT_TYPE_LABELS: Record<string, string> = {
  balance_sheet: "资产负债表",
  profit_statement: "利润表",
  cash_flow: "现金流量表"
};

export function openPdf(path: string) {
  const token = getStoredToken();
  const url = `${API_BASE_URL}${path}&_token=${encodeURIComponent(token ?? "")}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

export function openPdfNoToken(path: string) {
  const token = getStoredToken();
  const sep = path.includes("?") ? "&" : "?";
  window.open(`${API_BASE_URL}${path}${sep}_token=${encodeURIComponent(token ?? "")}`, "_blank", "noopener,noreferrer");
}

export function openHtmlPreview(title: string, html: string) {
  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.title = title;
  win.document.close();
}

export function escHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function cellStyle() {
  return { borderBottom: "1px solid rgba(20,40,60,0.08)", padding: "10px 8px", textAlign: "left" as const };
}

export const batchButtonStyle: React.CSSProperties = {
  fontSize: "12px",
  padding: "4px 12px",
  borderRadius: "6px",
  border: "1px solid rgba(20,40,60,0.15)",
  color: "#1e2a37",
  background: "none",
  cursor: "pointer",
  whiteSpace: "nowrap" as const
};

/** 供既有导出面板（pages/export/*）复用的按钮渲染器，签名与旧页保持一致。 */
export function renderExportActionButton(onClick: () => void, label = "导出 PDF") {
  return React.createElement(
    "button",
    { onClick, style: batchButtonStyle },
    label
  );
}
