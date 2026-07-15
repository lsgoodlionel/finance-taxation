import { moveActiveIndex } from "./use-list-hotkeys";

/**
 * useListHotkeys 单测。
 * 测试基建为纯 node（tsx）脚本执行，没有 DOM / window，无法挂载
 * window keydown 事件，也无法用 renderToStaticMarkup 触发键盘交互，
 * 因此 hook 本体（事件绑定/清理）不在此覆盖，聚焦纯函数 moveActiveIndex；
 * isTypingTarget 依赖 HTMLElement / closest，同样需要 DOM，留给 E2E 层。
 */
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

// ── 空列表：任何移动都返回 -1（无高亮） ─────────────────────────────────────
assert(moveActiveIndex(-1, 1, 0) === -1, "expected -1 when list is empty");
assert(moveActiveIndex(0, -1, 0) === -1, "expected -1 when list is empty even with current set");
assert(moveActiveIndex(3, 1, -2) === -1, "expected -1 for negative itemCount");

// ── -1 起步（尚无高亮）：向下 / 向上都落在第一项 ─────────────────────────────
assert(moveActiveIndex(-1, 1, 5) === 0, "expected first item when moving down from no selection");
assert(moveActiveIndex(-1, -1, 5) === 0, "expected first item when moving up from no selection");

// ── 正常步进 ────────────────────────────────────────────────────────────────
assert(moveActiveIndex(0, 1, 5) === 1, "expected step down 0 -> 1");
assert(moveActiveIndex(3, -1, 5) === 2, "expected step up 3 -> 2");
assert(moveActiveIndex(1, 2, 5) === 3, "expected multi-step delta 1 -> 3");

// ── 越界钳制 ────────────────────────────────────────────────────────────────
assert(moveActiveIndex(4, 1, 5) === 4, "expected clamp at last index");
assert(moveActiveIndex(0, -1, 5) === 0, "expected clamp at first index");
assert(moveActiveIndex(2, 99, 5) === 4, "expected large positive delta clamped to last");
assert(moveActiveIndex(2, -99, 5) === 0, "expected large negative delta clamped to first");

// ── current 越界输入（列表收缩后的悬空下标）也被钳回合法区间 ──────────────────
assert(moveActiveIndex(9, 1, 5) === 4, "expected out-of-range current clamped down");
assert(moveActiveIndex(9, -1, 5) === 4, "expected out-of-range current moving up clamped to last");

// ── 单元素列表 ──────────────────────────────────────────────────────────────
assert(moveActiveIndex(-1, 1, 1) === 0, "expected single-item list to select index 0");
assert(moveActiveIndex(0, 1, 1) === 0, "expected single-item list to stay at 0");
