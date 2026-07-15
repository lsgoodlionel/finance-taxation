import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DataTableShell, TABLE_DENSITY_STORAGE_KEY, persistDensity, readStoredDensity } from "./DataTableShell";
import { WorkspaceModeProvider, WORKSPACE_MODE_STORAGE_KEY } from "../../lib/workspace-mode";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

// ── node 环境下 stub window.localStorage ─────────────────────────────────────
// 组件仅在渲染期（useState 初始化）读取记忆的密度，模块加载期不触碰 window，
// 因此静态 import 后再挂 stub 即可生效。
function createFakeStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); }
  };
}

const fakeStorage = createFakeStorage();
(globalThis as { window?: unknown }).window = { localStorage: fakeStorage };

// ── 记忆读写：readStoredDensity / persistDensity ─────────────────────────────
assert(readStoredDensity() === "comfortable", "expected comfortable default when nothing stored");

persistDensity("compact");
assert(fakeStorage.getItem(TABLE_DENSITY_STORAGE_KEY) === "compact", "expected persist to write localStorage");
assert(readStoredDensity() === "compact", "expected stored compact to be read back");

persistDensity("comfortable");
assert(readStoredDensity() === "comfortable", "expected stored comfortable to be read back");

fakeStorage.setItem(TABLE_DENSITY_STORAGE_KEY, "bogus");
assert(readStoredDensity() === "comfortable", "expected invalid stored value to fall back to comfortable");

// ── 渲染：默认舒适档 + pro 回退模式下显示密度切换 ────────────────────────────
fakeStorage.removeItem(TABLE_DENSITY_STORAGE_KEY);
const defaultHtml = renderToStaticMarkup(
  createElement(DataTableShell, { title: "凭证列表", children: createElement("table") })
);
assert(defaultHtml.includes('data-density="comfortable"'), "expected default comfortable density attribute");
assert(defaultHtml.includes("凭证列表"), "expected title rendered");
assert(defaultHtml.includes("紧凑") && defaultHtml.includes("舒适"), "expected density toggle in pro mode");

// ── 渲染：记忆为紧凑时初始即为 compact 属性 ─────────────────────────────────
fakeStorage.setItem(TABLE_DENSITY_STORAGE_KEY, "compact");
const compactHtml = renderToStaticMarkup(
  createElement(DataTableShell, { title: "凭证列表", children: createElement("table") })
);
assert(compactHtml.includes('data-density="compact"'), "expected stored compact density attribute");

// ── 渲染：guided 模式下不显示密度切换（属性仍存在，样式只作用于 compact） ──────
fakeStorage.setItem(WORKSPACE_MODE_STORAGE_KEY, "guided");
const guidedHtml = renderToStaticMarkup(
  createElement(
    WorkspaceModeProvider,
    null,
    createElement(DataTableShell, { title: "凭证列表", children: createElement("table") })
  )
);
assert(!guidedHtml.includes("紧凑"), "expected no density toggle in guided mode");
assert(guidedHtml.includes("data-density="), "expected density attribute kept in guided mode");
