import React, { type ReactNode } from "react";

type ContractsListPanelProps = {
  children: ReactNode;
};

export function ContractsListPanel({ children }: ContractsListPanelProps) {
  return <div>{children}</div>;
}
