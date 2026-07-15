import { useEffect, useState } from "react";

/**
 * V7 L2 财务专业线键盘效率：列表热键 hook（pro 模式列表通用）。
 * - j / ArrowDown：下移高亮   k / ArrowUp：上移高亮
 * - x：勾选/取消当前项       a：对当前项执行主动作（如批准）
 * - Enter：打开当前项详情
 * 焦点在 input/textarea/select/contenteditable 或打开的弹层内时不响应，
 * 避免与表单输入、Modal 冲突。
 */
export interface ListHotkeysOptions {
  /** 列表长度；为 0 时热键不响应移动。 */
  itemCount: number;
  /** 总开关（如仅 pro 模式、列表可见时启用）。 */
  isEnabled: boolean;
  onToggle?: (index: number) => void;
  onPrimary?: (index: number) => void;
  onOpen?: (index: number) => void;
}

/** 共享守卫：焦点在输入类元素或弹层内时不响应全局热键（供期间快切等复用）。 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.closest(".ant-modal, .ant-drawer, [role=\"dialog\"]") !== null;
}

/** 纯函数：计算移动后的高亮下标（越界钳制，itemCount 为 0 返回 -1）。 */
export function moveActiveIndex(current: number, delta: number, itemCount: number): number {
  if (itemCount <= 0) return -1;
  const base = current < 0 ? (delta > 0 ? -1 : 0) : current;
  return Math.min(itemCount - 1, Math.max(0, base + delta));
}

export function useListHotkeys(options: ListHotkeysOptions): {
  activeIndex: number;
  setActiveIndex: (index: number) => void;
} {
  const { itemCount, isEnabled, onToggle, onPrimary, onOpen } = options;
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (!isEnabled) return undefined;
    const handler = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      switch (event.key) {
        case "j":
        case "ArrowDown":
          event.preventDefault();
          setActiveIndex((current) => moveActiveIndex(current, 1, itemCount));
          break;
        case "k":
        case "ArrowUp":
          event.preventDefault();
          setActiveIndex((current) => moveActiveIndex(current, -1, itemCount));
          break;
        case "x":
          setActiveIndex((current) => {
            if (current >= 0 && current < itemCount) onToggle?.(current);
            return current;
          });
          break;
        case "a":
          setActiveIndex((current) => {
            if (current >= 0 && current < itemCount) onPrimary?.(current);
            return current;
          });
          break;
        case "Enter":
          setActiveIndex((current) => {
            if (current >= 0 && current < itemCount) onOpen?.(current);
            return current;
          });
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isEnabled, itemCount, onToggle, onPrimary, onOpen]);

  // 列表长度变化后钳制高亮，避免悬空下标
  useEffect(() => {
    setActiveIndex((current) => (current >= itemCount ? itemCount - 1 : current));
  }, [itemCount]);

  return { activeIndex, setActiveIndex };
}
