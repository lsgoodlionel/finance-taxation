/**
 * 全局无障碍状态播报（WCAG 2.2 · SC 4.1.3 Status Messages）。
 *
 * 背景：antd `message.xxx()` / 弹层内的操作结果（审批通过、批量处理完成等）
 * 只是视觉 toast，屏幕阅读器不会自动播报（sonner 的 toast 有内置
 * aria-live，但 antd message 没有）。此模块提供一个进程内单例的隐藏
 * aria-live 区域，供关键状态变化调用 `announce()` 补一条播报，
 * 不影响任何可见 UI。
 *
 * SSR / 无 DOM 环境（本仓库测试用 renderToStaticMarkup，无 jsdom）下
 * 安全降级为空操作，不抛错。
 */

const POLITE_REGION_ID = "ft-live-region-polite";
const ASSERTIVE_REGION_ID = "ft-live-region-assertive";
const REANNOUNCE_DELAY_MS = 30;

function visuallyHide(el: HTMLElement): void {
  Object.assign(el.style, {
    position: "absolute",
    width: "1px",
    height: "1px",
    padding: "0",
    margin: "-1px",
    overflow: "hidden",
    clip: "rect(0,0,0,0)",
    whiteSpace: "nowrap",
    border: "0",
  });
}

function ensureRegion(id: string, level: "polite" | "assertive"): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const existing = document.getElementById(id);
  if (existing) return existing;
  const el = document.createElement("div");
  el.id = id;
  el.setAttribute("aria-live", level);
  el.setAttribute("role", level === "assertive" ? "alert" : "status");
  el.setAttribute("aria-atomic", "true");
  visuallyHide(el);
  document.body.appendChild(el);
  return el;
}

/**
 * 向屏幕阅读器播报一条状态消息。
 * @param message 播报文案（中文白话，简短）。
 * @param urgent 是否使用 assertive（打断当前朗读）；默认 polite（排队播报）。
 */
export function announce(message: string, urgent = false): void {
  const trimmed = message.trim();
  if (!trimmed) return;
  const region = ensureRegion(urgent ? ASSERTIVE_REGION_ID : POLITE_REGION_ID, urgent ? "assertive" : "polite");
  if (!region) return;
  // 先清空再异步写入：确保连续两次相同文案也会被重新播报（多数屏幕阅读器
  // 只在文本节点内容变化时触发播报）。
  region.textContent = "";
  if (typeof window === "undefined") {
    region.textContent = trimmed;
    return;
  }
  window.setTimeout(() => {
    region.textContent = trimmed;
  }, REANNOUNCE_DELAY_MS);
}
