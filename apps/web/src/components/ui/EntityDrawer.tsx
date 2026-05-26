import React, { type ReactNode } from "react";

type EntityDrawerProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
};

export function EntityDrawer({ title, subtitle, actions, footer, children }: EntityDrawerProps) {
  return (
    <section className="v3-entity-drawer">
      <div className="v3-entity-drawer__header">
        <div>
          <h3 style={{ margin: 0, fontSize: "16px" }}>{title}</h3>
          {subtitle ? <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--v3-color-text-muted)" }}>{subtitle}</p> : null}
        </div>
        {actions ? <div>{actions}</div> : null}
      </div>
      <div className="v3-entity-drawer__body">{children}</div>
      {footer ? <div className="v3-entity-drawer__footer">{footer}</div> : null}
    </section>
  );
}
