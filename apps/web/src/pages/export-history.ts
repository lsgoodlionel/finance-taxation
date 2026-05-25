export interface ExportHistoryItem {
  id: string;
  kind: "report" | "document" | "voucher" | "tax" | "package" | "risk" | "rnd" | "payroll";
  label: string;
  fileName: string;
  createdAt: string;
}

export function appendExportHistory(
  current: ExportHistoryItem[],
  item: Omit<ExportHistoryItem, "id" | "createdAt">
) {
  const next: ExportHistoryItem[] = [
    {
      ...item,
      id: `export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString()
    },
    ...current
  ];

  return next.slice(0, 20);
}
