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
    <div style={{ display: "flex", flexDirection: "column", gap: "18px", height: "calc(100vh - 180px)", maxHeight: "860px", position: "relative" }}>
      <section className="v3-hero-shell">{header}</section>
      {history}
      {status}
      {flow ? <section className="v3-section-shell" data-tone="accent">{flow}</section> : null}
      <section className="v3-chat-shell">
        <div className="v3-section-heading">
          <span className="v3-section-kicker">对话工作区</span>
          <h2 className="v3-section-title">先看摘要，再在这里继续追问、补材料和推进事项。</h2>
        </div>
        <div className="v3-chat-shell__body">
          {chat}
          {composer}
        </div>
      </section>
    </div>
  );
}
