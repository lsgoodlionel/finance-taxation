export function panelStyle() {
  return {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)",
    padding: "24px"
  } as const;
}

export function cellStyle() {
  return {
    borderBottom: "1px solid rgba(20,40,60,0.08)",
    padding: "10px 8px",
    textAlign: "left" as const,
    verticalAlign: "top" as const
  };
}

export function actionButtonStyle(emphasis: "primary" | "secondary" = "secondary") {
  return emphasis === "primary"
    ? {
        background: "#1e2a37",
        color: "#fff",
        border: "none",
        borderRadius: "10px",
        padding: "8px 14px",
        cursor: "pointer",
        fontSize: "13px"
      }
    : {
        background: "rgba(30,42,55,0.06)",
        color: "#1e2a37",
        border: "1px solid rgba(20,40,60,0.12)",
        borderRadius: "10px",
        padding: "8px 14px",
        cursor: "pointer",
        fontSize: "13px"
      };
}

export function miniStatStyle() {
  return {
    borderRadius: "16px",
    border: "1px solid rgba(20,40,60,0.08)",
    background: "rgba(255,255,255,0.72)",
    padding: "16px"
  } as const;
}
