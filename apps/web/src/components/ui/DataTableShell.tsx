import React, { type ReactNode, useId, useState } from "react";
import { Segmented } from "antd";
import { useWorkspaceMode } from "../../lib/workspace-mode";

/**
 * V7 L4 表格密度：pro 模式标题区提供 紧凑/舒适 切换，选择记忆到 localStorage。
 * 实现方式：容器 data-density 属性 + tokens.css 中
 * `.v3-table-shell[data-density="compact"]` 收紧 antd 单元格 padding。
 */
export type TableDensity = "compact" | "comfortable";

export const TABLE_DENSITY_STORAGE_KEY = "ft.table-density";

const DENSITY_OPTIONS = [
  { label: "舒适", value: "comfortable" },
  { label: "紧凑", value: "compact" }
] as const;

/** 读取记忆的密度；无 window / 无记录 / 非法值时回退「舒适」。 */
export function readStoredDensity(): TableDensity {
  if (typeof window === "undefined") return "comfortable";
  try {
    const raw = window.localStorage.getItem(TABLE_DENSITY_STORAGE_KEY);
    return raw === "compact" || raw === "comfortable" ? raw : "comfortable";
  } catch {
    return "comfortable";
  }
}

/** 记忆密度选择；localStorage 不可用（隐私模式等）时静默降级为会话内状态。 */
export function persistDensity(density: TableDensity): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TABLE_DENSITY_STORAGE_KEY, density);
  } catch {
    // 静默降级
  }
}

type DataTableShellProps = {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function DataTableShell({ title, actions, children }: DataTableShellProps) {
  const titleId = useId();
  const { mode } = useWorkspaceMode();
  const [density, setDensity] = useState<TableDensity>(() => readStoredDensity());
  const isPro = mode === "pro";

  const handleDensityChange = (next: TableDensity) => {
    setDensity(next);
    persistDensity(next);
  };

  return (
    <section
      className="v3-table-shell"
      data-density={density}
      aria-labelledby={title ? titleId : undefined}
    >
      {title || actions || isPro ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          {title ? <h3 id={titleId} style={{ margin: 0, fontSize: "15px" }}>{title}</h3> : <span />}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            {actions}
            {isPro && (
              <Segmented<TableDensity>
                size="small"
                aria-label="表格密度"
                options={[...DENSITY_OPTIONS]}
                value={density}
                onChange={handleDensityChange}
              />
            )}
          </div>
        </div>
      ) : null}
      <div>{children}</div>
    </section>
  );
}
