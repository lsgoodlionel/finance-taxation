import React, { type ReactNode, useId } from "react";

type DataTableShellProps = {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function DataTableShell({ title, actions, children }: DataTableShellProps) {
  const titleId = useId();

  return (
    <section
      className="v3-table-shell"
      aria-labelledby={title ? titleId : undefined}
    >
      {title || actions ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          {title ? <h3 id={titleId} style={{ margin: 0, fontSize: "15px" }}>{title}</h3> : <span />}
          {actions}
        </div>
      ) : null}
      <div>{children}</div>
    </section>
  );
}
