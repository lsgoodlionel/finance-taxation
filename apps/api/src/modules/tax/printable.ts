export function buildTaxWorkingPaperPrintableHtml(title: string, payload: unknown): string {
  return `<!doctype html>
  <html lang="zh-CN">
  <head><meta charset="utf-8"><title>${title}</title></head>
  <body style="font-family:Arial,sans-serif;padding:24px;color:#222;">
    <h1>${title}</h1>
    <pre style="white-space:pre-wrap;background:#f7f7f7;padding:16px;border:1px solid #ddd;">${JSON.stringify(payload, null, 2)}</pre>
    <div style="margin-top:16px;font-weight:700;">应纳增值税 / 税款测算请结合正式申报口径复核。</div>
  </body>
  </html>`;
}
