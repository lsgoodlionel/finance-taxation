/**
 * 共享 a11y 小工具：自定义可交互元素（如 antd List.Item 这类只挂 onClick
 * 的非原生控件）补键盘激活支持时复用，避免各处重复手写、写法不一致。
 */
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

/** 视作「激活」的按键：Enter 与 Space（与原生 button 行为一致）。 */
export function isActivationKey(key: string): boolean {
  return key === "Enter" || key === " ";
}

/**
 * 生成一个 onKeyDown 处理函数：Enter/Space 时阻止默认行为（避免 Space
 * 触发页面滚动）并调用 onActivate；用于给非原生 button 的可点击元素
 * （已配合 role="button" + tabIndex={0}）补齐键盘可达性。
 */
export function activateOnEnterOrSpace(
  onActivate: () => void
): (event: ReactKeyboardEvent<HTMLElement>) => void {
  return (event) => {
    if (!isActivationKey(event.key)) return;
    event.preventDefault();
    onActivate();
  };
}
