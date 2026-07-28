/**
 * V10「一次只显示一件事」的页面壳。
 *
 * 要解决的问题：/tax 首屏 13 个平级区块（滚动 3.9 屏），其中只有 2 块是用户
 * 此刻要操作的；/risk 10 块、/inbox 10 块。页面把「这个模块能做什么」全摊开，
 * 用户得先在一屏噪音里找出「我现在要做什么」。
 *
 * 本组件的做法：页面声明它承载哪几件事（TaskDef[]），壳只渲染当前这件事的
 * 工作区，其余收进顶部一行紧凑切换器（带待办角标，让该做的事自己冒出来）。
 * 选中项由调用方经 URL（?task=）持有 —— 见 lib/task-focus.ts 的 resolveActiveTask，
 * 本组件保持受控、不自持状态，刷新/分享/前进后退都落在同一件事上。
 *
 * 与 pages/close/ClosePlanBoard 的关系：那里是「一件事内部的分步」，
 * 这里是「一个页面承载的几件事之间的取舍」，两者可以叠加使用。
 */
import React, { useRef } from "react";
import { resolveTaskByArrowKey, type TaskDef } from "../../lib/task-focus";

/** 标签与面板的 id 生成规则外露，便于页面在别处引用（如跳转后聚焦）。 */
export function taskTabId(key: string): string {
  return `task-tab-${key}`;
}

export function taskPanelId(key: string): string {
  return `task-panel-${key}`;
}

export interface TaskFocusShellProps {
  /** 本页承载的几件事；顺序即呈现顺序（要按紧急度排请先过 sortTasksByUrgency）。 */
  tasks: readonly TaskDef[];
  /** 当前选中的任务 key，由调用方从 URL 解析后传入。 */
  activeKey: string | null;
  onSelectTask: (key: string) => void;
  /** 当前任务的工作区——壳只渲染这一块。 */
  children: React.ReactNode;
  /** 可选：当前任务的只读上下文，排在工作区之后，属于次要信息。 */
  aside?: React.ReactNode;
  /** 切换器的无障碍名称。 */
  switcherLabel?: string;
}

const SHELL_STYLE: React.CSSProperties = { display: "grid", gap: 14 };

/**
 * 切换器横向可滚动：窄屏下任务多时让切换器自己滚，
 * 而不是折行把主体往下挤、或压缩标签到读不出来。
 */
const TABLIST_STYLE: React.CSSProperties = {
  display: "flex",
  gap: 8,
  overflowX: "auto",
  padding: "2px 2px 6px",
  margin: 0,
  WebkitOverflowScrolling: "touch"
};

const BASE_TAB_STYLE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  flexShrink: 0,
  minHeight: 40,
  padding: "8px 16px",
  borderRadius: 999,
  fontSize: 14,
  whiteSpace: "nowrap",
  cursor: "pointer",
  transition: "background .15s, color .15s, border-color .15s"
};

const ACTIVE_TAB_STYLE: React.CSSProperties = {
  ...BASE_TAB_STYLE,
  border: "1px solid rgba(37,99,235,0.45)",
  background: "rgba(37,99,235,0.10)",
  color: "#1d4ed8",
  fontWeight: 700
};

const IDLE_TAB_STYLE: React.CSSProperties = {
  ...BASE_TAB_STYLE,
  border: "1px solid rgba(20,40,60,0.10)",
  background: "rgba(248,250,252,0.9)",
  color: "#4d5d6c",
  fontWeight: 500
};

const BADGE_STYLE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 20,
  height: 20,
  padding: "0 6px",
  borderRadius: 999,
  background: "#dc2626",
  color: "#fff",
  fontSize: 12,
  fontWeight: 700,
  lineHeight: "20px"
};

const HEADING_STYLE: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  lineHeight: 1.3,
  color: "#1e2a37"
};

const DESCRIPTION_STYLE: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  lineHeight: 1.6,
  color: "var(--v3-color-text-muted, #6b7a8d)"
};

const PANEL_STYLE: React.CSSProperties = { display: "grid", gap: 16, minWidth: 0 };

const ASIDE_STYLE: React.CSSProperties = { display: "grid", gap: 12, minWidth: 0 };

export function TaskFocusShell({
  tasks,
  activeKey,
  onSelectTask,
  children,
  aside,
  switcherLabel = "当前要做的事"
}: TaskFocusShellProps) {
  const tablistRef = useRef<HTMLDivElement>(null);

  const activeTask = tasks.find((task) => task.key === activeKey) ?? null;
  // 只有一件事时不摆切换器：一个 tab 的 tablist 是纯噪音，直接把标题亮出来。
  const hasSwitcher = tasks.length > 1;
  // activeKey 异常（空/不在列表里）时仍保证切换器里有且仅有一个可 Tab 进入的落点。
  const focusableKey = activeTask?.key ?? tasks[0]?.key ?? null;
  // 只有「切换器存在且确实选中了某件事」时，主体才是一个名副其实的 tabpanel；
  // 否则挂 role 会造出一个没有名称、也没有对应 tab 的孤儿面板。
  const panelTask = hasSwitcher ? activeTask : null;

  function focusTab(key: string): void {
    const nodes = tablistRef.current?.querySelectorAll<HTMLButtonElement>("[data-task-key]");
    if (!nodes) return;
    Array.from(nodes)
      .find((node) => node.dataset.taskKey === key)
      ?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    const target = resolveTaskByArrowKey(tasks, activeKey, event.key);
    if (!target) return;
    // 阻止方向键滚动页面 / Home-End 跳到文档首尾，焦点跟着选中项走（roving tabindex）。
    event.preventDefault();
    onSelectTask(target);
    focusTab(target);
  }

  function renderTab(task: TaskDef) {
    const isActive = task.key === activeKey;
    const hasBadge = typeof task.badge === "number" && task.badge > 0;
    return (
      <button
        key={task.key}
        type="button"
        role="tab"
        id={taskTabId(task.key)}
        data-task-key={task.key}
        aria-selected={isActive}
        aria-controls={isActive ? taskPanelId(task.key) : undefined}
        // 角标只写数字，读屏听到「税费申报 3」不知所云，这里补成完整短语。
        aria-label={hasBadge ? `${task.label}，待办 ${task.badge} 项` : undefined}
        tabIndex={task.key === focusableKey ? 0 : -1}
        onClick={() => onSelectTask(task.key)}
        style={isActive ? ACTIVE_TAB_STYLE : IDLE_TAB_STYLE}
      >
        {task.label}
        {hasBadge ? (
          <span style={BADGE_STYLE} aria-hidden="true">
            {task.badge}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <section style={SHELL_STYLE}>
      {hasSwitcher ? (
        <div
          ref={tablistRef}
          role="tablist"
          aria-label={switcherLabel}
          aria-orientation="horizontal"
          onKeyDown={handleKeyDown}
          style={TABLIST_STYLE}
        >
          {tasks.map(renderTab)}
        </div>
      ) : activeTask ? (
        <h2 style={HEADING_STYLE}>{activeTask.label}</h2>
      ) : null}

      {activeTask?.description ? <p style={DESCRIPTION_STYLE}>{activeTask.description}</p> : null}

      <div
        role={panelTask ? "tabpanel" : undefined}
        id={panelTask ? taskPanelId(panelTask.key) : undefined}
        aria-labelledby={panelTask ? taskTabId(panelTask.key) : undefined}
        style={PANEL_STYLE}
      >
        {children}
      </div>

      {aside ? (
        <aside aria-label="这件事的相关信息" style={ASIDE_STYLE}>
          {aside}
        </aside>
      ) : null}
    </section>
  );
}
