import React, { type ReactNode } from "react";
import { EntityDrawer } from "../../components/ui/EntityDrawer";

type EventDetailPanelProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function EventDetailPanel({ title, subtitle, actions, children }: EventDetailPanelProps) {
  return (
    <EntityDrawer title={title} subtitle={subtitle} actions={actions}>
      {children}
    </EntityDrawer>
  );
}
