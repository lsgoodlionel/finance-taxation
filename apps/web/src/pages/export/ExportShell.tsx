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
      {header}
      {guidance}
      {sceneSelector}
      {content}
      {history}
      {archive}
    </div>
  );
}
