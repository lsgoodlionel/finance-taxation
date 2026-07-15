import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

/**
 * V7 双轨工作区模式：
 * - guided：非财务人员（董事长/员工/查看者等），白话 + 极简导航 + 场景向导
 * - pro：财务专业人员（财务总监/会计/出纳/税务专员/审计员），完整导航 + 效率增强
 * 两轨共享同一路由树 / API / 权限 / 审计，仅呈现层分轨。
 */
export type WorkspaceMode = "guided" | "pro";

export const WORKSPACE_MODE_STORAGE_KEY = "ft.workspace-mode";

const PRO_ROLE_MARKERS = [
  "finance-director",
  "accountant",
  "cashier",
  "tax-specialist",
  "auditor",
  "cfo"
] as const;

/** 按角色推导默认模式：任一财务角色 → pro，否则（含董事长）→ guided。 */
export function deriveDefaultMode(roleIds: readonly string[]): WorkspaceMode {
  const isProRole = roleIds.some((roleId) =>
    PRO_ROLE_MARKERS.some((marker) => roleId === marker || roleId === `role-${marker}`)
  );
  return isProRole ? "pro" : "guided";
}

export function readStoredMode(): WorkspaceMode | null {
  try {
    const raw = window.localStorage.getItem(WORKSPACE_MODE_STORAGE_KEY);
    return raw === "guided" || raw === "pro" ? raw : null;
  } catch {
    return null;
  }
}

function persistMode(mode: WorkspaceMode): void {
  try {
    window.localStorage.setItem(WORKSPACE_MODE_STORAGE_KEY, mode);
  } catch {
    // localStorage 不可用（隐私模式等）时静默降级为会话内状态
  }
}

interface WorkspaceModeContextValue {
  mode: WorkspaceMode;
  /** 手动切换并记忆（localStorage）。 */
  setMode: (mode: WorkspaceMode) => void;
  /** 登录后按角色初始化：仅在用户从未手动选择过时生效。 */
  initFromRoles: (roleIds: readonly string[]) => void;
}

const WorkspaceModeContext = createContext<WorkspaceModeContextValue | null>(null);

export function WorkspaceModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<WorkspaceMode>(() => readStoredMode() ?? "pro");

  const setMode = useCallback((next: WorkspaceMode) => {
    setModeState(next);
    persistMode(next);
  }, []);

  const initFromRoles = useCallback((roleIds: readonly string[]) => {
    if (readStoredMode() !== null) return;
    setModeState(deriveDefaultMode(roleIds));
  }, []);

  const value = useMemo(
    () => ({ mode, setMode, initFromRoles }),
    [mode, setMode, initFromRoles]
  );

  return <WorkspaceModeContext.Provider value={value}>{children}</WorkspaceModeContext.Provider>;
}

/** 在 Provider 外调用时安全回退为 pro（如独立测试渲染），不抛错。 */
export function useWorkspaceMode(): WorkspaceModeContextValue {
  const ctx = useContext(WorkspaceModeContext);
  if (ctx) return ctx;
  return {
    mode: "pro",
    setMode: () => undefined,
    initFromRoles: () => undefined
  };
}
