// 财税工作台 Service Worker（E3 PWA）。
// 策略：导航请求 network-first + 离线回退到已缓存的应用外壳；静态资源 stale-while-revalidate。
// v2：/v2/ 接口纳入不缓存名单（修复前 /v2 曾被 SPA fallback 污染为 HTML 并被本 SW
// 永久缓存）；升版本号促使 activate 清掉所有旧缓存，老客户端刷新即自愈。
//
// v3：缓存名改为随构建变化。此前它是写死的 "ft-shell-v2"，而 activate 只删
// 「名字不等于当前 CACHE」的缓存 —— 名字不变，预缓存进去的那份 index.html 就
// 永远不会被清理；sw.js 文件内容不变，浏览器也不会重新 install/activate。
// 于是一次发布之后，SW 仍可能拿旧 shell 兜底。__BUILD_ID__ 由 vite.config.ts 的
// ft-sw-cache-version 插件在构建产物里替换成入口 chunk 名（含内容 hash）：
// 代码变了才换名字，代码没变则不会平白让所有客户端丢缓存。
const CACHE = "ft-shell-__BUILD_ID__";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }
  // API 请求不缓存（保证数据实时、避免陈旧财务数据）；/v2/ 前缀接口同理。
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/v2/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/index.html").then((r) => r || caches.match("/")))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
