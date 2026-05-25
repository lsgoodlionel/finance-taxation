import { appendExportHistory, type ExportHistoryItem } from "./export-history";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const history = appendExportHistory([], {
  kind: "report",
  label: "资产负债表 2026-05",
  fileName: "资产负债表_2026-05_快照.pdf"
});

assert(history.length === 1, "expected first history item");
assert(history[0]?.kind === "report", "expected report kind");
assert(history[0]?.fileName === "资产负债表_2026-05_快照.pdf", "expected file name persistence");

const capped = Array.from({ length: 21 }).reduce<ExportHistoryItem[]>((items, _, index) => {
  return appendExportHistory(items, {
    kind: "voucher",
    label: `凭证 ${index + 1}`,
    fileName: `凭证_${index + 1}.pdf`
  });
}, history);

assert(capped.length === 20, "expected history to cap at 20 items");

console.log("export-history-ok");
