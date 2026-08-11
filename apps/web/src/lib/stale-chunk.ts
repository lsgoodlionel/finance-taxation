/**
 * 识别「页面版本落后于服务端」导致的 chunk 加载失败，并据此决定要不要自愈。
 *
 * ## 场景
 *
 * 页面一直开着，期间发生了一次部署。浏览器内存里的是旧 index.html，它记的是旧的
 * 带 hash 的 chunk 文件名；新构建把那些文件换掉了。此时点侧边栏走的是 client-side
 * routing，**不发 navigate 请求**，直接 dynamic import 一个已经不存在的 URL。
 *
 * 结果是 React Router 的默认错误页：
 *   「Unexpected Application Error! Importing a module script failed.」
 *
 * 用户什么都没做错，却只能自己去按硬刷新 —— 而且这个提示完全没告诉他该按硬刷新。
 * 这类失败刷新一次就好，应该由应用自己处理掉。
 *
 * ## 为什么不能靠 Service Worker 或 nginx 解决
 *
 * nginx 已经对 index.html 发 `no-cache`、对 /assets/ 发 immutable，配置是对的；
 * SW 的导航请求也是 network-first。但这两者都只在**发起新请求**时起作用，
 * 而这里的页面根本没重新导航，问题出在已经跑起来的那份 JS 里。
 */

/**
 * 各浏览器对同一件事的措辞完全不同，只能逐一匹配：
 * - Safari/iOS：`Importing a module script failed.`
 * - Chrome/Edge：`Failed to fetch dynamically imported module: <url>`
 * - Firefox：`error loading dynamically imported module`
 * - Chrome 命中 SPA fallback 拿到 HTML 时：`'text/html' is not a valid JavaScript MIME type`
 * - Vite 预加载助手：`Unable to preload CSS for <url>`
 */
const STALE_CHUNK_PATTERNS: readonly RegExp[] = [
  /importing a module script failed/i,
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /is not a valid javascript mime type/i,
  /unable to preload css/i
];

/** 只自愈一次的标记键。用 sessionStorage：刷新后仍在，关掉标签页即清空。 */
const RELOAD_MARKER = "ft.stale-chunk-reloaded";

function messageOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

/** 这个错误是不是「页面版本落后」造成的 chunk 加载失败。 */
export function isStaleChunkError(error: unknown): boolean {
  const message = messageOf(error);
  if (!message) return false;
  return STALE_CHUNK_PATTERNS.some((pattern) => pattern.test(message));
}

/** 只需要 sessionStorage 的这两个方法；抽成接口是为了能直接单测。 */
export interface ReloadMarkerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * 判断是否应该为这个错误自动刷新页面。
 *
 * 刷新前会写一个 sessionStorage 标记：**同一个会话只自愈一次**。刷新之后若依旧
 * 失败，说明问题不是版本错位（可能是构建产物真的缺文件、或代理挂了），必须把真
 * 错误显示出来，而不是陷入无限刷新 —— 那会让用户连错误信息都看不到。
 *
 * 非 chunk 错误一律返回 false 且**不写标记**：写了会吃掉下一次真正的自愈机会。
 *
 * storage 读写抛异常（隐私模式下 sessionStorage 可能不可用）时返回 false：
 * 读不到标记就无法防死循环，此时宁可不刷新，让用户看到错误页。
 */
export function shouldReloadForStaleChunk(
  error: unknown,
  storage: ReloadMarkerStorage
): boolean {
  if (!isStaleChunkError(error)) {
    return false;
  }
  try {
    if (storage.getItem(RELOAD_MARKER)) {
      return false;
    }
    storage.setItem(RELOAD_MARKER, "1");
    return true;
  } catch {
    return false;
  }
}
