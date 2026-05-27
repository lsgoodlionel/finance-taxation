import React, { type ReactNode } from "react";

type PayrollPolicySectionProps = {
  content: ReactNode;
};

export function PayrollPolicySection({ content }: PayrollPolicySectionProps) {
  return <>{content}</>;
}
