export function buildExportFileName(parts: Array<string | null | undefined>, extension = "pdf") {
  const normalized = parts
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .map((part) =>
      part
        .replace(/[\\/:*?"<>|]+/g, "-")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
    )
    .filter(Boolean);

  return `${normalized.join("_") || "export"}.${extension}`;
}
