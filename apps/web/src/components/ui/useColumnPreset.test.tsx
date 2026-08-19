/**
 * 列预设的行为断言（V15）。
 *
 * 最要紧的一条是「一个 key 都没对上时退回全部列」——切出一张空表比
 * 显示得多糟糕得多，因为空表会被读成「没有数据」。
 */

import { columnKeyOf, readColumnPreset } from "./useColumnPreset";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

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
assert(readColumnPreset("reimbursements") === "core", "默认应当是核心视图");

fakeStorage.setItem("ft.columns.reimbursements", "all");
assert(readColumnPreset("reimbursements") === "all", "展开过应当被记住");
assert(readColumnPreset("vouchers") === "core", "记忆不该跨表泄漏");

fakeStorage.setItem("ft.columns.vouchers", "bogus");
assert(readColumnPreset("vouchers") === "core", "非法值应当退回核心视图");

// ── columnKeyOf：优先 key，退回 dataIndex ───────────────────────────────────
assert(columnKeyOf({ key: "status" }) === "status", "应当优先取 key");
assert(columnKeyOf({ dataIndex: "amountCents" }) === "amountCents", "无 key 时取 dataIndex");
assert(columnKeyOf({ key: "a", dataIndex: "b" }) === "a", "key 优先于 dataIndex");
assert(columnKeyOf({}) === "", "两者都没有时返回空串而不是 undefined");
// 数组形式的 dataIndex（antd 支持嵌套路径）取不出稳定 key，返回空串——
// 这样它在核心视图里不会被误命中一个同样为空的 key。
assert(columnKeyOf({ dataIndex: ["a", "b"] as unknown }) === "", "数组 dataIndex 应当返回空串");

// ── 核心筛选与兜底（用纯函数复刻 hook 的筛选逻辑）─────────────────────────
function filterCore<T extends { key?: unknown; dataIndex?: unknown }>(
  columns: readonly T[],
  coreKeys: readonly string[]
): T[] {
  const coreSet = new Set(coreKeys);
  const kept = columns.filter((column) => coreSet.has(columnKeyOf(column)));
  return kept.length === 0 ? [...columns] : kept;
}

const columns = [
  { key: "no" },
  { dataIndex: "amountCents" },
  { key: "status" },
  { key: "exportBatchNo" }
];

const core = filterCore(columns, ["no", "amountCents", "status"]);
assert(core.length === 3, "核心视图应当只留三列");
assert(columnKeyOf(core[0]!) === "no", "顺序应当按原数组，不按 coreKeys 重排");
assert(columnKeyOf(core[2]!) === "status", "顺序应当保持原样，否则切换视图时列会跳动");

const allWrongKeys = filterCore(columns, ["typo-a", "typo-b"]);
assert(
  allWrongKeys.length === columns.length,
  "一个 key 都没对上时应当退回全部列——空表会被读成没有数据"
);

console.log("useColumnPreset tests passed");
