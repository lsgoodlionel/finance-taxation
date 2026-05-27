import React, { type ReactNode } from "react";

type ExportShellProps = {
  header: ReactNode;
  guidance?: ReactNode;
  sceneSelector: ReactNode;
  content: ReactNode;
  history: ReactNode;
  archive: ReactNode;
};

export function ExportShell({ header, guidance, sceneSelector, content, history, archive }: ExportShellProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <section className="v3-hero-shell">{header}</section>
      {guidance ? <section className="v3-section-shell" data-tone="muted">{guidance}</section> : null}
      <section className="v3-section-shell" data-tone="accent">{sceneSelector}</section>
      <section className="v3-section-shell">{content}</section>
      <section className="v3-section-shell" data-tone="muted">{history}</section>
      <section className="v3-section-shell" data-tone="muted">{archive}</section>
    </div>
  );
}
