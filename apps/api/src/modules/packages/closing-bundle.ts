import type { ClosingPackageExport } from "@finance-taxation/domain-model";

export function buildClosingPackageExport(
  kind: "month_end" | "audit" | "inspection",
  period: string,
  input: {
    reportSnapshotIds: string[];
    taxBatchIds: string[];
    riskFindingIds: string[];
    rndProjectIds?: string[];
  }
): ClosingPackageExport {
  return {
    kind,
    period,
    title: `${period} ${kind === "month_end" ? "月结" : kind === "audit" ? "审计" : "稽核"}资料包`,
    sections: [
      { heading: "报表快照", items: input.reportSnapshotIds.length ? input.reportSnapshotIds : ["无"] },
      { heading: "税务批次", items: input.taxBatchIds.length ? input.taxBatchIds : ["无"] },
      { heading: "风险事项", items: input.riskFindingIds.length ? input.riskFindingIds : ["无"] },
      { heading: "研发项目", items: input.rndProjectIds?.length ? input.rndProjectIds : ["无"] }
    ]
  };
}

export function buildClosingPackageHtml(bundle: ClosingPackageExport): string {
  return `<!doctype html>
  <html lang="zh-CN">
  <head><meta charset="utf-8"><title>${bundle.title}</title></head>
  <body style="font-family:Arial,sans-serif;padding:24px;color:#222;">
    <h1>${bundle.title}</h1>
    ${bundle.sections
      .map(
        (section) => `<section><h2>${section.heading}</h2><ul>${section.items
          .map((item) => `<li>${item}</li>`)
          .join("")}</ul></section>`
      )
      .join("")}
  </body>
  </html>`;
}
