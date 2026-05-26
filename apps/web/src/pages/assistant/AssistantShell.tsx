import React, { type ReactNode } from "react";

type AssistantShellProps = {
  header: ReactNode;
  flow?: ReactNode;
  status?: ReactNode;
  history?: ReactNode;
  chat: ReactNode;
  composer?: ReactNode;
};

export function AssistantShell({ header, flow, status, history, chat, composer }: AssistantShellProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", height: "calc(100vh - 180px)", maxHeight: "800px", position: "relative" }}>
      {header}
      {history}
      {status}
      {flow}
      {chat}
      {composer}
    </div>
  );
}
