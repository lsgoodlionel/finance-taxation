import { buildExportFileName } from "./pdf-export-utils";

function assertEqual(actual: string, expected: string, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

assertEqual(
  buildExportFileName(["资产负债表", "2026-05", "快照"]),
  "资产负债表_2026-05_快照.pdf",
  "should join readable filename parts"
);

assertEqual(
  buildExportFileName(["费用报销单", "INV/2026:05", "张三"]),
  "费用报销单_INV-2026-05_张三.pdf",
  "should replace invalid filesystem characters"
);

assertEqual(
  buildExportFileName(["  凭证导出  ", "", "ACC 01 "]),
  "凭证导出_ACC-01.pdf",
  "should trim whitespace and normalize spaces"
);

console.log("pdf-export-utils-ok");
