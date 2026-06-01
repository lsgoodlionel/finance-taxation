export function tableStyle() {
  return { width: "100%", borderCollapse: "collapse" as const };
}

export function cellStyle() {
  return {
    borderBottom: "1px solid rgba(20,40,60,0.08)",
    padding: "10px 8px",
    textAlign: "left" as const,
    verticalAlign: "top" as const
  };
}

export function numCellStyle() {
  return {
    ...cellStyle(),
    textAlign: "right" as const,
    fontVariantNumeric: "tabular-nums" as const
  };
}
