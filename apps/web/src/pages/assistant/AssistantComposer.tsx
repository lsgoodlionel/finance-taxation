import React, { type ReactNode } from "react";

type AssistantComposerProps = {
  children: ReactNode;
};

export function AssistantComposer({ children }: AssistantComposerProps) {
  return <>{children}</>;
}
