import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VouchersShell } from "./VouchersShell";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function render(props: Partial<Parameters<typeof VouchersShell>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(VouchersShell, {
      header: createElement("div", null, "header"),
      flow: createElement("div", null, "flow"),
      children: createElement("div", null, "workspace"),
      ...props
    })
  );
}

/** 顶层区块数 = section/aside 的开标签数。 */
function countBlocks(html: string): number {
  return (html.match(/<(section|aside)\b/g) ?? []).length;
}

// ── 首屏区块预算 ─────────────────────────────────────────────────────────────
// 改造前 /vouchers 平铺 7 块（含两块语义重复的运行态面板和一块喂假数据的阶段流程图）。

const bare = render();
assert(bare.includes("header"), "expected the header slot");
assert(bare.includes("flow"), "expected the object flow slot");
assert(bare.includes("workspace"), "expected the workspace slot");
assert(countBlocks(bare) === 3, `expected 3 blocks without notice/aside, got ${countBlocks(bare)}`);

const full = render({
  notice: createElement("div", null, "notice"),
  aside: createElement("div", null, "runtime")
});
assert(countBlocks(full) === 5, `expected at most 5 blocks on the vouchers page, got ${countBlocks(full)}`);

// ── 阅读顺序：页头 → 筛选提示 → 这一笔走到哪 → 工作区 → 运行态 ────────────────

const order = ["header", "notice", "flow", "workspace", "runtime"].map((slot) => full.indexOf(slot));
assert(
  order.every((position, index) => position >= 0 && (index === 0 || position > order[index - 1]!)),
  "expected header → notice → flow → workspace → runtime reading order"
);

// 运维信息是次要内容，必须落在 aside 里而不是又一个平级 section
assert(
  full.indexOf("<aside") > full.lastIndexOf("<section"),
  "expected the runtime block to render as a trailing aside, not another peer section"
);

// 没有跨页筛选时不留空壳
assert(!bare.includes("notice"), "expected no notice block when nothing was filtered in");
assert(!bare.includes("<aside"), "expected no aside shell when there is nothing to put in it");

console.log("vouchers-shell-ok");
