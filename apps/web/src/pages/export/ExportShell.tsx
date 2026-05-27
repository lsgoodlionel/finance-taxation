import React, { type ReactNode } from "react";

type ExportShellProps = {
  header: ReactNode;
  guidance?: ReactNode;
  sceneSelector: ReactNode;
  history: ReactNode;
  archive: ReactNode;
  content: ReactNode;
};

export function ExportShell({ header, guidance, sceneSelector, history, archive, content }: ExportShellProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {header}
      {guidance}
      {sceneSelector}
      {history}
      {archive}
      {content}
    </div>
  );
}
