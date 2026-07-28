import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { RndProjectSummary } from "@finance-taxation/domain-model";
import { RndShell } from "./RndShell";
import { RndContextPanel } from "./RndContextPanel";

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

function makeSummary(overrides: Partial<RndProjectSummary> = {}): RndProjectSummary {
  return {
    projectId: "rnd-1",
    expenseAmount: "0",
    capitalizedAmount: "0",
    totalHours: "0",
    superDeductionEligibleBase: "0",
    ...overrides
  };
}

// 骨架只剩「页头 + 当前任务工作区」两块。改造前根网格下是 8 个平级区块。
{
  const html = renderToStaticMarkup(
    createElement(RndShell, {
      header: createElement("div", null, "rnd-header"),
      children: createElement("div", null, "rnd-task-panel")
    })
  );

  assert(html.includes("rnd-header"), "expected the R&D shell header slot");
  assert(html.includes("rnd-task-panel"), "expected the R&D shell task panel slot");

  const blocks = countTopLevelBlocks(html);
  assert(blocks === 2, `expected 2 top-level blocks on /rnd, got ${blocks}`);
}

// 上下文面板随任务收缩：挑项目时看全局盘子，归集/核对时只看这一个项目。
{
  const overview = renderToStaticMarkup(
    createElement(RndContextPanel, {
      task: "projects" as const,
      project: null,
      projectCount: 4,
      projectsWithoutCosts: 2,
      message: "共 4 个研发项目。"
    })
  );
  assert(overview.includes("研发台账概览"), "the project task aside shows the portfolio overview");
  assert(overview.includes("还没归集费用"), "the overview names the real backlog");
  // 没有选中项目就没有对象级流程条——没有对象，就没有「这一笔走到哪了」。
  assert(!overview.includes("办到哪了"), "no object flow bar without a selected project");
  assert(!overview.includes("这个项目的基本情况"), "the overview must not carry per-project details");
}

{
  const project = {
    id: "rnd-1",
    companyId: "c-1",
    businessEventId: null,
    code: "RND-2026-001",
    name: "AI 财税系统研发",
    status: "active" as const,
    capitalizationPolicy: "mixed" as const,
    startedOn: "2026-01-01",
    endedOn: null,
    ownerId: null,
    notes: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    costLines: [],
    timeEntries: [],
    summary: makeSummary({ totalHours: "120" }),
    policyReview: { projectId: "rnd-1", projectName: "AI 财税系统研发", recommendedPolicy: "mixed" as const, conflicts: [], guidance: [] },
    guidance: { projectId: "rnd-1", projectName: "AI 财税系统研发", subsidyHints: [], policyHints: [], riskHints: [] }
  };

  const costsAside = renderToStaticMarkup(
    createElement(RndContextPanel, {
      task: "costs" as const,
      project,
      projectCount: 4,
      projectsWithoutCosts: 2,
      message: "已加载"
    })
  );

  assert(costsAside.includes("办到哪了"), "a selected project gets an object flow bar");
  assert(costsAside.includes("归集研发费用"), "the flow names the current step");
  assert(costsAside.includes("这个项目的基本情况"), "the cost aside carries per-project context");
  assert(!costsAside.includes("研发台账概览"), "the cost aside must not repeat the portfolio overview");
  // 工时出现在上下文里，但必须同时说清它不参与基数计算——否则用户会以为工时少了会少扣。
  assert(costsAside.includes("120 小时"), "hours are shown as context");
  // 「加计扣除」被 <Term> 包成了独立元素，所以断言分两段查而不是查整句。
  assert(costsAside.includes("工时是备查资料，不参与"), "hours must be labelled as non-contributing");
  assert(costsAside.includes("基数只看费用化金额"), "the aside must state what the base actually counts");
}

console.log("rnd-shell-ok");
