/**
 * 加载失败不能伪装成「没有数据」（V16）。
 *
 * ## 缺陷
 *
 * 研发项目清单接口返回 403 时，页面照常显示「还没有研发项目」。
 * 风险页同理，显示「0 条 · 全部已关闭 · 关闭率 0%」——一份看起来很健康的看板。
 *
 * 税务专员在角色实验里被这两句话误导过：他的本职工作就是归集加计扣除与盯税务风险，
 * 看到「还没有研发项目」会去问业务部门为什么不立项，而真正的问题在权限上
 * （`role-tax-specialist` 没有 `rnd.view` / `risk.view`）。
 * 同一个账号从归档包接口能读到「未关闭 7 项」——数据一直在，只是他读不到。
 *
 * **给人看「一切正常」比给人看报错危险得多。**
 * 报错会让人去查，而「一切正常」会让人据此做决定。
 */

import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RndProjectListPanel } from "./RndProjectListPanel";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function render(props: {
  projects?: never[];
  loadError?: string | null;
}): string {
  return renderToStaticMarkup(
    createElement(RndProjectListPanel, {
      projects: props.projects ?? [],
      loadError: props.loadError ?? null,
      selectedProjectId: null,
      onSelectProject: () => {},
      onCollectCosts: () => {}
    })
  );
}

// ── 真的没有项目：可以说「还没有研发项目」 ──────────────────────────────────
const emptyHtml = render({});
assert(emptyHtml.includes("还没有研发项目"), "确实没有项目时，空态文案是对的");
assert(!emptyHtml.includes("读不到数据"), "没出错就不该说读不到数据");

// ── 加载失败：必须说读不到，且明确否认「没有项目」这个解读 ──────────────────
const errorHtml = render({
  loadError: "当前账号没有查看研发项目的权限（rnd.view）。请联系管理员开通。"
});
assert(
  !errorHtml.includes("还没有研发项目"),
  "加载失败时绝不能显示「还没有研发项目」——那是把权限问题伪装成业务事实"
);
assert(errorHtml.includes("没有加载出来"), "要说清是加载失败");
assert(errorHtml.includes("rnd.view"), "403 要指明缺哪个权限，用户才知道去找谁开");
assert(
  errorHtml.includes("这不是"),
  "要主动否认「没有项目」这个解读——用户的第一反应就是那个"
);

// ── 错误优先于空态 ──────────────────────────────────────────────────────────
// 加载失败时 projects 必然是空数组，两个条件同时成立，错误必须赢。
assert(
  render({ projects: [], loadError: "boom" }).includes("没有加载出来"),
  "projects 为空且有错误时，先报错误"
);

console.log("rnd-list-error-state: 6 assertions passed");
