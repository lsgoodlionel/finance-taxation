import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";

/** sw.js 里等待被替换成真实构建标识的占位符。 */
const BUILD_ID_PLACEHOLDER = "__BUILD_ID__";

/**
 * 把 `public/sw.js` 里的 `__BUILD_ID__` 换成本次构建的标识。
 *
 * 为什么必须这么做：Service Worker 的缓存名此前是写死的 `ft-shell-v2`，而
 * `activate` 只删「名字不等于当前 CACHE」的缓存。缓存名不变 ⇒ 预缓存进去的
 * 那份 index.html 永远不会被清理，浏览器也不会因为文件内容没变而重新
 * install/activate。结果是一次发布之后，SW 仍可能拿旧 shell 兜底。
 *
 * 用主 chunk 的文件名（带 Vite 的内容 hash）当构建标识：代码变了 hash 就变，
 * sw.js 的字节随之变化，浏览器才会重新走一遍 install → activate → 清旧缓存。
 * 反过来，代码没变时标识也不变，不会平白让所有客户端丢缓存。
 */
function serviceWorkerCacheVersion(): Plugin {
  return {
    name: "ft-sw-cache-version",
    apply: "build",
    closeBundle() {
      const outDir = resolve(__dirname, "dist");
      const swPath = resolve(outDir, "sw.js");
      let sw: string;
      try {
        sw = readFileSync(swPath, "utf8");
      } catch {
        // 没有 sw.js 就没什么可做的（例如换了构建目标）。不阻断构建。
        return;
      }
      if (!sw.includes(BUILD_ID_PLACEHOLDER)) {
        // 占位符被人删掉了就直接报错：静默跳过会让缓存名重新退化成固定值，
        // 而那正是本插件要修的问题，且退化后没有任何症状可见。
        throw new Error(
          `sw.js 缺少 ${BUILD_ID_PLACEHOLDER} 占位符，Service Worker 缓存名将不随构建变化`
        );
      }
      const html = readFileSync(resolve(outDir, "index.html"), "utf8");
      const entry = /\/assets\/([A-Za-z0-9_.-]+\.js)/.exec(html)?.[1];
      if (!entry) {
        throw new Error("无法从 index.html 解析出入口 chunk，Service Worker 版本号无从生成");
      }
      writeFileSync(swPath, sw.replaceAll(BUILD_ID_PLACEHOLDER, entry), "utf8");
    }
  };
}

export default defineConfig({
  plugins: [react(), serviceWorkerCacheVersion()],
  server: {
    host: "127.0.0.1",
    port: 3000
  },
  build: {
    rollupOptions: {
      output: {
        // Split heavy, rarely-changing vendors into their own long-cache chunks
        // so a page edit doesn't invalidate the whole vendor bundle.
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          antd: ["antd", "@ant-design/icons"],
          charts: ["recharts"]
        }
      }
    }
  }
});
