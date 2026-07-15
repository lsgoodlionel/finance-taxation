import type { CSSProperties, ReactNode } from "react";

// ─── Shared layout helpers for SettingsPage tabs ─────────────────────────────

export function panelStyle(): CSSProperties {
  return {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)",
    padding: "28px"
  };
}

interface SectionHeaderProps {
  children: ReactNode;
}

export function SectionHeader({ children }: SectionHeaderProps) {
  return (
    <div style={{ fontSize: "12px", fontWeight: 700, color: "#9aa5b4", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "14px", marginTop: "4px" }}>
      {children}
    </div>
  );
}

interface FieldRowProps {
  label: string;
  children: ReactNode;
}

export function FieldRow({ label, children }: FieldRowProps) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "12px", alignItems: "center", marginBottom: "14px" }}>
      <label style={{ color: "#4d5d6c", fontSize: "13px", fontWeight: 600 }}>{label}</label>
      {children}
    </div>
  );
}

export function inputStyle(): CSSProperties {
  return { width: "100%", maxWidth: "360px" };
}
