import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HelpPanel, HelpTriggerButton } from "./HelpPanel";
import { LevelLegend, RISK_SEVERITY_LEVELS } from "./LevelLegend";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

// ── 打开时渲染标准五段结构 ────────────────────────────────────────────────────
const fullHtml = renderToStaticMarkup(
  createElement(
    HelpPanel,
    {
      open: true,
      title: "示例中心 · 操作说明",
      onClose: () => undefined,
      responsibility: "负责示例业务",
      relations: "上游是事项，下游是报表",
      workflowSteps: ["第一步录入", "第二步复核"],
      operations: "新建、查看、归档",
      caution: "先补齐资料再推进"
    },
    createElement(LevelLegend, { title: "风险严重级别", items: RISK_SEVERITY_LEVELS })
  )
);
assert(fullHtml.includes("示例中心 · 操作说明"), "expected panel title");
assert(fullHtml.includes("本页负责什么"), "expected responsibility section heading");
assert(fullHtml.includes("上下游关系"), "expected relations section heading");
assert(fullHtml.includes("标准流程"), "expected workflow section heading");
assert(fullHtml.includes("第二步复核"), "expected workflow step content");
assert(fullHtml.includes("常见操作"), "expected operations section heading");
assert(fullHtml.includes("先补齐资料再推进"), "expected caution content");
assert(fullHtml.includes("风险严重级别"), "expected custom node (LevelLegend) to render");
assert(fullHtml.includes("致命"), "expected level legend items to render");
assert(fullHtml.includes("关闭说明"), "expected close button aria label");

// ── 每段可选：省略的段落不渲染标题 ───────────────────────────────────────────
const minimalHtml = renderToStaticMarkup(
  createElement(HelpPanel, {
    open: true,
    title: "极简帮助",
    onClose: () => undefined,
    responsibility: "只有职责一段"
  })
);
assert(minimalHtml.includes("本页负责什么"), "expected only provided section");
assert(!minimalHtml.includes("标准流程"), "expected omitted workflow section to be hidden");
assert(!minimalHtml.includes("常见操作"), "expected omitted operations section to be hidden");

// ── 关闭时不渲染任何内容 ─────────────────────────────────────────────────────
const closedHtml = renderToStaticMarkup(
  createElement(HelpPanel, { open: false, title: "隐藏", onClose: () => undefined })
);
assert(closedHtml === "", "expected closed panel to render nothing");

// ── 触发按钮：问号图标 + 无障碍标签 ──────────────────────────────────────────
const triggerHtml = renderToStaticMarkup(
  createElement(HelpTriggerButton, { onClick: () => undefined, label: "查看凭证中心帮助" })
);
assert(triggerHtml.includes("查看凭证中心帮助"), "expected trigger aria label");
assert(triggerHtml.includes("question-circle"), "expected question circle icon");
