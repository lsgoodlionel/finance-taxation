import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { RiskPageShell } from "./RiskPageShell";
import { RiskFindingsWorkspace } from "./RiskFindingsWorkspace";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(createElement(MemoryRouter, null, node));
}

const VOID_TAGS = new Set(["br", "hr", "img", "input", "link", "meta", "source"]);

/** 数根容器下的直接子元素——「首屏区块」在实测里就是按这个数的。 */
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

// 页面骨架只剩「页头 + 全站流程条 + 当前任务工作区」三块
{
  const html = render(
    createElement(RiskPageShell, {
      header: createElement("div", null, "risk-header"),
      children: createElement("div", null, "risk-task-panel")
    })
  );

  assert(html.includes("risk-header"), "expected risk shell header slot");
  assert(html.includes("risk-task-panel"), "expected risk shell task panel slot");
  // 写死 currentNodeId 的「风险检查流程回看」已移除，不该再出现在骨架里
  assert(!html.includes("风险检查流程回看"), "hardcoded process flow section must stay removed");

  // 首屏区块上限：页头 / 全站流程条 / 任务工作区。改造前是 10 块。
  const blocks = countTopLevelBlocks(html);
  assert(blocks === 3, `expected 3 top-level blocks on /risk, got ${blocks}`);
}

// 「处理风险发现」这件事内部仍是四块：总量、列表、处置工作台、复盘记录
{
  const html = render(
    createElement(RiskFindingsWorkspace, {
      kpiCards: createElement("div", null, "risk-kpi"),
      list: createElement("div", null, "risk-list"),
      detail: createElement("div", null, "risk-detail"),
      timeline: createElement("div", null, "risk-timeline")
    })
  );

  assert(html.includes("risk-kpi"), "expected findings workspace kpi slot");
  assert(html.includes("risk-list"), "expected findings workspace list slot");
  assert(html.includes("risk-detail"), "expected findings workspace detail slot");
  assert(html.includes("risk-timeline"), "expected findings workspace timeline slot");
}
