import React, { type ReactNode } from "react";

type ContractsWorkbenchProps = {
  children: ReactNode;
};

export function ContractsWorkbench({ children }: ContractsWorkbenchProps) {
  return <div>{children}</div>;
}
