import React, { type ReactNode } from "react";

type AssistantStatusPanelProps = {
  children: ReactNode;
};

export function AssistantStatusPanel({ children }: AssistantStatusPanelProps) {
  return <>{children}</>;
}
