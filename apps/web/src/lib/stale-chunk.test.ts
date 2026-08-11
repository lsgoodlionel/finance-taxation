import { isStaleChunkError, shouldReloadForStaleChunk } from "./stale-chunk";

/** 与本目录其它 web 测试一致的极简断言（web 的 tsconfig 不含 node 类型）。 */
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}（实际 ${String(actual)}，期望 ${String(expected)}）`);
}

/**
 * 「一直开着的页面遇上一次部署」是这套判定要解决的场景：
 * 页面加载时拿到的是旧 index.html，内存里记的是旧 chunk 文件名；部署后那些带 hash
 * 的文件已被替换，此时点侧边栏（client-side routing，不发 navigate 请求）触发
 * dynamic import，浏览器去拉一个已经不存在的 URL —— 直接摔到 React Router 的
 * 默认错误页「Unexpected Application Error! Importing a module script failed.」。
 *
 * 用户什么都没做错，能做的只有自己去按硬刷新。这不该由用户承担。
 */

// ── 识别：各浏览器对同一件事的措辞完全不同，逐一钉住 ──────────────────────
{
  const messages = [
    // Safari / iOS
    "Importing a module script failed.",
    // Chrome / Edge
    "Failed to fetch dynamically imported module: https://x/assets/index-AbC123.js",
    // Firefox
    "error loading dynamically imported module",
    // Chrome 对 preload 的另一种措辞
    "'text/html' is not a valid JavaScript MIME type",
    // Vite 预加载助手包装后的措辞
    "Unable to preload CSS for /assets/x.css"
  ];
  for (const message of messages) {
    assertEqual(isStaleChunkError(new Error(message)), true, `应识别：${message}`);
  }
}

// 大小写与前后缀不应影响判定（不同浏览器版本会加壳）
assertEqual(isStaleChunkError(new Error("TypeError: Failed to Fetch Dynamically Imported Module: /a.js")), true, "断言失败");

// ── 不误伤：真正的业务错误必须原样抛给错误页，否则会被 reload 掩盖成「偶发」 ──
{
  const notStale = [
    "Cannot read properties of undefined (reading 'id')",
    "Network request failed",
    "凭证借贷不平",
    "500 Internal Server Error",
    // 名字里带 module 但与加载失败无关
    "Module initialization threw an exception"
  ];
  for (const message of notStale) {
    assertEqual(isStaleChunkError(new Error(message)), false, `不应误判：${message}`);
  }
}

assertEqual(isStaleChunkError(null), false, "断言失败");
assertEqual(isStaleChunkError(undefined), false, "断言失败");
assertEqual(isStaleChunkError("Importing a module script failed."), true, "字符串错误也要认");
assertEqual(isStaleChunkError({ message: "Failed to fetch dynamically imported module" }), true, "断言失败");

// ── 只自愈一次：刷新后若依旧失败，说明不是版本错位，必须把真错误显示出来 ──
{
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v)
  };

  // 第一次：允许 reload，并留下标记
  assertEqual(shouldReloadForStaleChunk(new Error("Importing a module script failed."), storage), true, "断言失败");
  // 第二次：标记还在 → 不再 reload，否则会陷入无限刷新
  assertEqual(shouldReloadForStaleChunk(new Error("Importing a module script failed."), storage), false, "断言失败");
}

// 非 chunk 错误一律不 reload，且不得留下标记（否则会吃掉下一次真正的自愈机会）
{
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v)
  };
  assertEqual(shouldReloadForStaleChunk(new Error("凭证借贷不平"), storage), false, "断言失败");
  assertEqual(store.size, 0, "非 chunk 错误不应写标记");
  // 紧接着来一次真的 chunk 错误，仍应允许自愈
  assertEqual(shouldReloadForStaleChunk(new Error("Importing a module script failed."), storage), true, "断言失败");
}

// storage 不可用（隐私模式下 sessionStorage 可能抛）时不能连带崩掉错误页
{
  const throwing = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("SecurityError");
    }
  };
  assertEqual(shouldReloadForStaleChunk(new Error("Importing a module script failed."), throwing), false, "读不到标记就无法防死循环，此时宁可不 reload");
}

console.log("stale-chunk-ok");
