const PRINT_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans", Arial, sans-serif;
  font-size: 12px; color: #111; padding: 24px;
}
@media print {
  @page { margin: 12mm 10mm; size: A4; }
  .no-print { display: none !important; }
  .page-break { page-break-before: always; }
  table { page-break-inside: auto; }
  tr { page-break-inside: avoid; }
}
.doc-header { border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
.doc-title { font-size: 20px; font-weight: 700; }
.doc-meta { font-size: 11px; color: #555; text-align: right; line-height: 1.8; }
.section { margin-bottom: 20px; }
.section-title { font-size: 13px; font-weight: 700; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #ddd; }
table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 11.5px; }
th, td { border: 1px solid #ccc; padding: 5px 8px; text-align: left; }
th { background: #f2f2f2; font-weight: 600; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.total-row td { font-weight: 700; background: #f8f8f8; border-top: 2px solid #999; }
.subtotal-row td { font-weight: 600; background: #fafafa; }
.doc-footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #ccc; font-size: 10.5px; color: #666; display: flex; justify-content: space-between; }
.sig-line { width: 140px; border-bottom: 1px solid #999; display: inline-block; height: 16px; margin-left: 8px; }
.print-btn { position: fixed; bottom: 24px; right: 24px; padding: 10px 22px; background: #1e2a37; color: #fff; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
@media print { .print-btn { display: none; } }
`;

export function wrapHtml(title: string, body: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>${PRINT_CSS}</style>
</head>
<body>
  ${body}
  <button class="print-btn no-print" onclick="window.print()">打印 / 导出 PDF</button>
</body>
</html>`;
}

export function fmt(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  if (isNaN(v)) return "—";
  return v.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
