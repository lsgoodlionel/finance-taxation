/**
 * 注册 Service Worker，启用 PWA 安装与离线查看（E3）。
 * 仅在生产构建且浏览器支持时注册；开发态跳过以免干扰 HMR。
 */
export function registerServiceWorker(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  if (import.meta.env.DEV) {
    return;
  }
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // SW 注册失败不应影响应用可用性
    });
  });
}
