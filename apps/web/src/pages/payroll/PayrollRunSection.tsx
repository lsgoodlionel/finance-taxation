import React, { type ReactNode } from "react";

type PayrollRunSectionProps = {
  summary?: ReactNode;
  controls: ReactNode;
  history?: ReactNode;
  detail?: ReactNode;
  empty?: ReactNode;
};

export function PayrollRunSection({
  summary,
  controls,
  history,
  detail,
  empty
}: PayrollRunSectionProps) {
  return (
    <>
      {summary}
      {controls}
      {history}
      {detail}
      {empty}
    </>
  );
}
