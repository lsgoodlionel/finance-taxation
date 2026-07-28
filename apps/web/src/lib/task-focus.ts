/**
 * V10「一次一件事」的纯逻辑。
 *
 * 问题：页面被当成「领域全景」——/tax 首屏 13 个平级区块里只有 2 块是用户
 * 此刻要操作的，其余是别的任务的入口、只读上下文和全局导航。用户打开页面
 * 看到的是「这个模块能做什么」，而不是「你现在要做什么」。
 *
 * 解法：页面声明它承载哪几件事（TaskDef），一次只渲染一件事的工作区，
 * 其余收进任务切换器。选中的任务写进 URL（?task=），可刷新、可分享、
 * 可前进后退 —— 与 V3 的 URL-State-First 原则一致。
 */

export interface TaskDef {
  key: string;
  /** 任务名，用动词短语（「申报这个月的税」而非「申报批次」）。 */
  label: string;
  /** 一句话说明这件事在做什么，给不熟悉的人看。 */
  description?: string;
  /** 待办数量等角标，帮用户决定先做哪件。 */
  badge?: number;
}

/**
 * 决定当前应激活哪个任务。
 *
 * - URL 指定且合法 → 用它（可刷新/可分享）
 * - 否则用调用方给的默认值（若合法）
 * - 再否则用第一个任务；任务列表为空时返回 null
 */
export function resolveActiveTask(
  tasks: readonly TaskDef[],
  urlTaskKey: string | null | undefined,
  fallbackKey?: string | null
): string | null {
  if (tasks.length === 0) return null;
  const has = (key: string | null | undefined): key is string =>
    typeof key === "string" && tasks.some((task) => task.key === key);

  if (has(urlTaskKey)) return urlTaskKey;
  if (has(fallbackKey)) return fallbackKey;
  return tasks[0]?.key ?? null;
}

/**
 * 按角标把「有待办的任务」排在前面，其余保持声明顺序。
 * 用于任务切换器的呈现——让「该做的事」自己浮上来，而不是让用户逐个看。
 */
export function sortTasksByUrgency(tasks: readonly TaskDef[]): TaskDef[] {
  return [...tasks].sort((a, b) => (b.badge ?? 0) - (a.badge ?? 0));
}

/**
 * 任务切换器的键盘导航：给定当前任务与按下的键，返回应切换到的任务 key。
 *
 * 为什么需要它：切换器是 WAI-ARIA 的 tablist，规范要求方向键在标签间移动、
 * Home/End 跳到首尾（Tab 键只负责进出整个切换器）。把这段推导做成纯函数，
 * 组件里只剩「切换 + 移动焦点」两句，逻辑本身可单测。
 *
 * 左右到头回绕（与 APG 的水平 tablist 推荐一致）；上下键一并支持，
 * 是为了切换器在窄屏折行/纵向排列时手感一致。非导航键返回 null。
 */
export function resolveTaskByArrowKey(
  tasks: readonly TaskDef[],
  activeKey: string | null | undefined,
  pressedKey: string
): string | null {
  if (tasks.length === 0) return null;

  const currentIndex = tasks.findIndex((task) => task.key === activeKey);
  const safeIndex = currentIndex === -1 ? 0 : currentIndex;
  const lastIndex = tasks.length - 1;

  const targetIndex = (() => {
    switch (pressedKey) {
      case "ArrowRight":
      case "ArrowDown":
        return safeIndex === lastIndex ? 0 : safeIndex + 1;
      case "ArrowLeft":
      case "ArrowUp":
        return safeIndex === 0 ? lastIndex : safeIndex - 1;
      case "Home":
        return 0;
      case "End":
        return lastIndex;
      default:
        return null;
    }
  })();

  if (targetIndex === null) return null;
  return tasks[targetIndex]?.key ?? null;
}
