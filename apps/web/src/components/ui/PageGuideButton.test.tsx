/**
 * 指南按钮的行为断言（V15）。
 *
 * 两条都来自用户报的问题：
 *
 * 1. **不在 Router 里也不能炸。** 页头现在渲染这个按钮，而页头的单测是纯渲染
 *    （不套 Router）。让组件为了一个辅助按钮就强依赖路由上下文是本末倒置——
 *    那会逼着每一处用到页头的测试都去套 Router，而它们测的根本不是路由。
 * 2. **一个页面只出现一个按钮。** 页头版与顶栏兜底版同时渲染会重复，
 *    而两个一模一样的问号按钮比没有按钮更让人怀疑自己点错了。
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { PageGuideButton } from "./PageGuideButton";
import { PageHeader } from "./PageHeader";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

// ── 不在 Router 里：不炸，也不显示按钮 ──────────────────────────────────────
const bare = renderToStaticMarkup(createElement(PageGuideButton));
assert(bare === "", "不在 Router 里时应当什么都不渲染，而不是抛错");

// 页头在没有 Router 的测试里照样能渲染——这是上面那条降级的意义所在。
const headerWithoutRouter = renderToStaticMarkup(
  createElement(PageHeader, { title: "合同与往来", subtitle: "副标题" })
);
assert(headerWithoutRouter.includes("合同与往来"), "页头本身应当正常渲染");
assert(!headerWithoutRouter.includes("本页指南"), "拿不到路由时不显示指南按钮");

// ── 在 Router 里、路由有指南：显示 ──────────────────────────────────────────
const withGuide = renderToStaticMarkup(
  createElement(
    MemoryRouter,
    { initialEntries: ["/contracts"] },
    createElement(PageHeader, { title: "合同与往来" })
  )
);
assert(withGuide.includes("本页指南"), "合同页应当显示指南按钮——这正是用户报的那个页面");

// ── 路由没有指南：不显示（点开是空的按钮比没有按钮更让人失望）────────────
const noGuide = renderToStaticMarkup(
  createElement(
    MemoryRouter,
    { initialEntries: ["/nowhere"] },
    createElement(PageHeader, { title: "不存在的页面" })
  )
);
assert(!noGuide.includes("本页指南"), "没有指南的路由不该显示按钮");

// ── hideGuide：显式关掉 ────────────────────────────────────────────────────
const hidden = renderToStaticMarkup(
  createElement(
    MemoryRouter,
    { initialEntries: ["/contracts"] },
    createElement(PageHeader, { title: "合同与往来", hideGuide: true })
  )
);
assert(!hidden.includes("本页指南"), "hideGuide 应当关掉按钮");

// ── actions 与指南并存，且指南排在主操作之后 ──────────────────────────────
const withActions = renderToStaticMarkup(
  createElement(
    MemoryRouter,
    { initialEntries: ["/contracts"] },
    createElement(PageHeader, {
      title: "合同与往来",
      actions: createElement("button", null, "新建合同")
    })
  )
);
assert(withActions.includes("新建合同"), "主操作应当仍在");
assert(
  withActions.indexOf("新建合同") < withActions.indexOf("本页指南"),
  "指南是辅助，应当排在主操作之后，不该抢「新建」的位置"
);

console.log("PageGuideButton tests passed");
