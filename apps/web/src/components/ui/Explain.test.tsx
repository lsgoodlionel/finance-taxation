/**
 * `Explain` 的行为断言（V15）。
 *
 * 折叠组件最容易出的错是「记忆写进去了但读不出来」——表现为每次刷新都收起，
 * 用户以为设置没生效。这里把读写两头都钉住。
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Explain, readExplainOpen } from "./Explain";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const STORAGE_PREFIX = "ft.explain.";

function createFakeStorage() {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    }
  };
}

const fakeStorage = createFakeStorage();
(globalThis as { window?: unknown }).window = { localStorage: fakeStorage };

// ── 记忆读写 ────────────────────────────────────────────────────────────────
assert(
  readExplainOpen("cost.completion") === false,
  "默认应当收起——第一次见到某一页的人应当看到简单的样子"
);

fakeStorage.setItem(`${STORAGE_PREFIX}cost.completion`, "1");
assert(readExplainOpen("cost.completion") === true, "展开过应当被记住");

// 记忆按 key 分开——报销页展开了不代表凭证页也要展开。
assert(readExplainOpen("voucher.posting") === false, "记忆不该跨 key 泄漏");

// ── 渲染：默认收起时正文不在 DOM 里 ─────────────────────────────────────────
const collapsed = renderToStaticMarkup(
  createElement(Explain, {
    title: "为什么材料是 100%",
    storageKey: "test.collapsed",
    children: "开工时一次性投料"
  })
);
assert(collapsed.includes("为什么材料是 100%"), "收起时标题仍应可见");
assert(
  !collapsed.includes("开工时一次性投料"),
  "收起时正文不该渲染——渲染出来只是用 CSS 藏起来，屏幕阅读器仍会念"
);
assert(collapsed.includes('aria-expanded="false"'), "收起状态要对辅助技术表达出来");

// ── defaultOpen：给「不看会做错」的说明用 ───────────────────────────────────
const opened = renderToStaticMarkup(
  createElement(Explain, {
    title: "三项完工程度不同",
    storageKey: "test.opened",
    defaultOpen: true,
    children: "材料 100%，人工按加工进度"
  })
);
assert(opened.includes("材料 100%，人工按加工进度"), "defaultOpen 时正文应当渲染");
assert(opened.includes('aria-expanded="true"'), "展开状态要对辅助技术表达出来");

// ── 记忆的 key 会被清洗成合法 id ────────────────────────────────────────────
const weirdKey = renderToStaticMarkup(
  createElement(Explain, {
    title: "标题",
    storageKey: "a.b/c d",
    defaultOpen: true,
    children: "正文"
  })
);
assert(weirdKey.includes('id="explain-a-b-c-d"'), "storageKey 里的特殊字符应当被清洗");
assert(weirdKey.includes('aria-controls="explain-a-b-c-d"'), "aria-controls 应当指向正文");

// ── window 缺失与 localStorage 抛错时不炸 ───────────────────────────────────
delete (globalThis as { window?: unknown }).window;
assert(readExplainOpen("anything") === false, "没有 window 时应当返回收起而不是抛错");

(globalThis as { window?: unknown }).window = {
  localStorage: {
    getItem: () => {
      throw new Error("隐私模式");
    }
  }
};
assert(readExplainOpen("anything") === false, "localStorage 抛错时应当降级为收起");

console.log("Explain tests passed");
