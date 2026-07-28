import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { KnowledgeShell } from "./KnowledgeShell";
import { KnowledgeContextPanel } from "./KnowledgeContextPanel";
import { buildKnowledgeSummary } from "./knowledge-helpers";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
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

// 骨架只剩「页头 + 当前任务工作区」两块。改造前是 7 个平级槽位。
{
  const html = renderToStaticMarkup(
    createElement(KnowledgeShell, {
      header: createElement("div", null, "knowledge-header"),
      children: createElement("div", null, "knowledge-task-panel")
    })
  );

  assert(html.includes("knowledge-header"), "expected knowledge shell header slot");
  assert(html.includes("knowledge-task-panel"), "expected knowledge shell task panel slot");

  const blocks = countTopLevelBlocks(html);
  assert(blocks === 2, `expected 2 top-level blocks on /knowledge, got ${blocks}`);
}

// 上下文面板随任务变化：只有「查阅已有条目」看分类分布，另外两件事给本步骤的提示。
{
  const summary = buildKnowledgeSummary([]);

  const browse = renderToStaticMarkup(
    createElement(KnowledgeContextPanel, { task: "browse", summary, message: "共 0 条" })
  );
  assert(browse.includes("制度库概览"), "browse aside should show the library overview");
  assert(browse.includes("AI 引用说明"), "browse aside should keep the AI citation note");

  const create = renderToStaticMarkup(
    createElement(KnowledgeContextPanel, { task: "create", summary, message: "已新增" })
  );
  assert(!create.includes("制度库概览"), "create aside must not carry the overview stats");
  assert(create.includes("写好一条的要点"), "create aside should explain what makes a good entry");

  const importPanel = renderToStaticMarkup(
    createElement(KnowledgeContextPanel, { task: "import", summary, message: "解析完成" })
  );
  assert(!importPanel.includes("制度库概览"), "import aside must not carry the overview stats");
  assert(importPanel.includes("导入是怎么工作的"), "import aside should explain the import flow");
}
