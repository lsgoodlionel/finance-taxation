import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AssistantShell } from "./AssistantShell";
import { AssistantStatusBanners } from "./AssistantStatusBanners";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const VOID_TAGS = new Set(["br", "hr", "img", "input", "link", "meta", "source"]);

function countTopLevelBlocks(markup: string): number {
  let depth = 0;
  let count = 0;
  for (const match of markup.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>/g)) {
    const [, closing, name, , selfClose] = match;
    if (closing) {
      depth -= 1;
      continue;
    }
    if (depth === 1) count += 1;
    if (!VOID_TAGS.has((name ?? "").toLowerCase()) && !selfClose) depth += 1;
  }
  return count;
}

// ── 所有插槽都给内容时，六个槽位都在 ─────────────────────────────────────────

{
  const html = renderToStaticMarkup(
    createElement(AssistantShell, {
      header: createElement("div", null, "header"),
      flow: createElement("div", null, "flow"),
      status: createElement("div", null, "status"),
      history: createElement("div", null, "history"),
      chat: createElement("div", null, "chat"),
      composer: createElement("div", null, "composer")
    })
  );

  assert(html.includes("header"), "expected shell header slot");
  assert(html.includes("flow"), "expected shell flow slot");
  assert(html.includes("status"), "expected shell status slot");
  assert(html.includes("history"), "expected shell history slot");
  assert(html.includes("chat"), "expected shell chat slot");
  assert(html.includes("composer"), "expected shell composer slot");
}

// ── 首屏：还没提问、没有事项上下文时，只剩「页头 + 对话区」两块 ──────────────
//
// 这一页刻意不套 TaskFocusShell —— 对话本身就是一次一件事，拆成 tab 反而会把
// 连续的上下文切断，也逼用户在开口前先给自己的问题分类。改造的落点是
// 「没有内容的块不占版面」：改造前 flow 与 status 是无条件渲染的，flowContext
// 为 null 时 ProcessFlowCard 会退回概览模式，把全部流程节点摊成一排状态全为
// pending 的胶囊压在对话框上方；status 则渲染一个只有标题、下面空无一物的
// 「当前状态」区块。合起来首屏 4 块，其中 2 块与本轮对话无关。

{
  const html = renderToStaticMarkup(
    createElement(AssistantShell, {
      header: createElement("div", null, "header"),
      flow: undefined,
      status: null,
      history: null,
      chat: createElement("div", null, "chat"),
      composer: createElement("div", null, "composer")
    })
  );

  const blocks = countTopLevelBlocks(html);
  assert(blocks === 2, `expected 2 top-level blocks on a fresh /assistant, got ${blocks}`);
  assert(!html.includes("标准业务处理流程"), "the data-less overview flow card must not render without an event");
  assert(!html.includes("当前状态"), "the empty status section must not render");
  assert(html.includes("chat") && html.includes("composer"), "the conversation must still be there");
}

// ── 对话区标题不得再指向一个不存在的「摘要」 ─────────────────────────────────

{
  const html = renderToStaticMarkup(
    createElement(AssistantShell, {
      header: createElement("div", null, "header"),
      chat: createElement("div", null, "chat")
    })
  );
  assert(
    !html.includes("先看摘要"),
    "the chat heading must not promise a summary that only exists after an event is recognised"
  );
  assert(html.includes("对话工作区"), "the chat section keeps its kicker");
}

// ── 状态横幅：没有内容就整块不渲染 ───────────────────────────────────────────

{
  // 普通员工、操作视角、还没提过问 —— 一条横幅都没有。
  const empty = renderToStaticMarkup(
    createElement(AssistantStatusBanners, {
      isOpMode: true,
      isBoss: false,
      suggestedEventsCount: 0,
      hasBusinessEvent: false
    })
  );
  assert(empty === "", `expected no markup when there is nothing to say, got: ${empty}`);
}

{
  // 老板在决策视角 —— 有横幅，正常渲染。
  const decision = renderToStaticMarkup(
    createElement(AssistantStatusBanners, {
      isOpMode: false,
      isBoss: true,
      suggestedEventsCount: 0,
      hasBusinessEvent: false
    })
  );
  assert(decision.includes("决策视角"), "the decision-mode banner still renders");
  assert(decision.includes("当前状态"), "a non-empty status block keeps its heading");
}

// ── 「下一步」说的是步骤名，不是路由路径 ─────────────────────────────────────
//
// 改造前这里拼的是 nextFlowNode.routes[0]，于是用户会看到
// 「建议下一步前往 /vouchers 继续处理」——内部路径被当人话显示出来。

{
  const html = renderToStaticMarkup(
    createElement(AssistantStatusBanners, {
      isOpMode: true,
      isBoss: false,
      suggestedEventsCount: 0,
      hasBusinessEvent: true,
      nextStepLabel: "凭证生成与审核"
    })
  );
  assert(html.includes("凭证生成与审核"), "expected the human-readable step title");
  assert(!html.includes("/vouchers"), "a route path must never be shown as a destination name");
  assert(!/前往\s*\//.test(html), "no raw path may follow 「前往」");
}

{
  // 没有下一步时也不能退回去显示路径或含糊的占位符。
  const html = renderToStaticMarkup(
    createElement(AssistantStatusBanners, {
      isOpMode: true,
      isBoss: false,
      suggestedEventsCount: 0,
      hasBusinessEvent: true
    })
  );
  assert(html.includes("已进入流程跟踪"), "expected the fallback banner");
  assert(!html.includes("对应业务页"), "the vague placeholder is gone");
}

console.log("assistant-shell-ok");
