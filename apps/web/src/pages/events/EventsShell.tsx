import React, { type ReactNode } from "react";
import { FinanceFlowBar } from "../../components/FinanceFlowBar";

type EventsShellProps = {
  header: ReactNode;
  banner?: ReactNode;
  createPanel: ReactNode;
  listPanel: ReactNode;
  detailPanel: ReactNode;
};

export function EventsShell({ header, banner, createPanel, listPanel, detailPanel }: EventsShellProps) {
  return (
    <div style={{ display: "grid", gap: 20 }}>
      {header}
      <FinanceFlowBar current="events" />
      {banner}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 20 }}>
        {createPanel}
        {listPanel}
      </div>
      {detailPanel}
    </div>
  );
}
