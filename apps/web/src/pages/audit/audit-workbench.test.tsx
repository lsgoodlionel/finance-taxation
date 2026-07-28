import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { AuditLog } from "@finance-taxation/domain-model";
import { AuditPageShell } from "./AuditPageShell";
import { AuditFiltersBar } from "./AuditFiltersBar";
import { AuditIntegrityPanel } from "./AuditIntegrityPanel";
import { AuditTrailWorkspace } from "./AuditTrailWorkspace";

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

function noop() {
  /* 测试里不关心回调 */
}

function makeLog(id: string, action: string, resourceId: string): AuditLog {
  return {
    id,
    companyId: "c-1",
    userId: "u-1",
    userName: "张会计",
    action,
    resourceType: "voucher",
    resourceId,
    resourceLabel: "六月房租",
    changes: null,
    createdAt: "2026-06-01T02:00:00.000Z"
  };
}

// ── 骨架：只剩「页头 + 当前任务工作区」两块 ─────────────────────────────────
{
  const html = renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(AuditPageShell, {
      header: createElement("div", null, "audit-header"),
      children: createElement("div", null, "audit-task-panel")
    }))
  );

  assert(html.includes("audit-header"), "expected audit shell header slot");
  assert(html.includes("audit-task-panel"), "expected audit shell task panel slot");

  const blocks = countTopLevelBlocks(html);
  assert(blocks === 2, `expected 2 top-level blocks on /audit, got ${blocks}`);

  // 全站 10 环节导航条已移除：它与审计数据无关，且会与对象级流程条撞脸。
  assert(!html.includes("审计追溯"), "全站流程条不该再出现在审计页骨架里");
}

// ── 「验完整性」是一件独立的事，而不是页头里的一个标签 ───────────────────────
{
  const html = renderToStaticMarkup(
    createElement(AuditIntegrityPanel, {
      chainVerifying: false,
      chainResult: { valid: false, brokenAt: 37, total: 210 },
      onVerifyChain: noop,
      reviewLoading: false,
      reviewResult: null,
      onRunReview: noop
    })
  );

  assert(html.includes("第 37 条断裂"), "断裂位置要说出来");
  assert(html.includes("保留数据库现场"), "断裂是事故，必须给出下一步该做什么");
  assert(html.includes('role="alert"'), "断裂结论要以 alert 播报，不能只是变个颜色");
  assert(html.includes("AI 审计勾稽"), "AI 勾稽同属「按一下出结论」，收在这件事里");
}

{
  const html = renderToStaticMarkup(
    createElement(AuditIntegrityPanel, {
      chainVerifying: false,
      chainResult: { valid: true, total: 210 },
      onVerifyChain: noop,
      reviewLoading: false,
      reviewResult: null,
      onRunReview: noop
    })
  );
  assert(html.includes("审计链完整"), "通过时给出明确结论");
  assert(!html.includes("保留数据库现场"), "通过时不得出现事故处置话术");
}

// ── 后端补齐留痕后，这三类不得再挂「查不到」的说明 ───────────────────────────
//
// 曾经 risk_finding / document / tax_item 在 apps/api 一条审计日志都不写，这里
// 断言的是「要说清为什么查不到」。写入点补齐后（见 audit-resource-types.ts 的
// 清单注释），那句话变成了假话——它会让审计员放弃一条真的查得到的线索。
{
  for (const resourceType of ["risk_finding", "document", "tax_item"]) {
    const html = renderToStaticMarkup(
      createElement(AuditFiltersBar, {
        resourceType,
        resourceId: "",
        fromDate: "",
        toDate: "",
        onResourceTypeChange: noop,
        onResourceIdChange: noop,
        onFromDateChange: noop,
        onToDateChange: noop,
        onSearch: noop,
        onReset: noop
      })
    );
    assert(!html.includes("不写审计日志"), `${resourceType} 已有审计来源，不该再挂这句提示`);
  }

  const normal = renderToStaticMarkup(
    createElement(AuditFiltersBar, {
      resourceType: "voucher",
      resourceId: "",
      fromDate: "",
      toDate: "",
      onResourceTypeChange: noop,
      onResourceIdChange: noop,
      onFromDateChange: noop,
      onToDateChange: noop,
      onSearch: noop,
      onReset: noop
    })
  );
  assert(!normal.includes("不写审计日志"), "有审计来源的类型不该挂这句提示");
}

// ── 流程条只在能如实推导时出现 ──────────────────────────────────────────────

const trailProps = {
  logs: [makeLog("log-1", "approve", "vch-1")],
  loading: false,
  total: 1,
  limit: 50,
  offset: 0,
  navResourceId: "",
  expandedId: null,
  selectedLogId: "",
  resourceType: "voucher",
  resourceId: "vch-1",
  fromDate: "",
  toDate: "",
  onResourceTypeChange: noop,
  onResourceIdChange: noop,
  onFromDateChange: noop,
  onToDateChange: noop,
  onSearch: noop,
  onReset: noop,
  onToggleExpanded: noop,
  onSelectLog: noop,
  onNavigate: noop,
  onPrevPage: noop,
  onNextPage: noop
};

{
  const html = renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(AuditTrailWorkspace, trailProps))
  );
  assert(html.includes("走到哪了"), "追一个具体对象时给出它自己的流程条");
  assert(html.includes("依据它自己的审计记录"), "标题要写明依据，避免和全站导航条混淆");
  assert(html.includes("记入总账"), "凭证流程第二步");
}

{
  // 命中数超过一页 → 屏上的记录不是这个对象的全集，不画。
  const html = renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(AuditTrailWorkspace, { ...trailProps, total: 80 }))
  );
  assert(!html.includes("走到哪了"), "记录跨页时不得画流程条");
}

{
  // 通查（没指定对象）→ 流程的主语不存在，不画。
  const html = renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(AuditTrailWorkspace, { ...trailProps, resourceId: "" }))
  );
  assert(!html.includes("走到哪了"), "按期间通查时不该出现对象级流程条");
}

{
  // 没有后端强制顺序的类型 → 不画。
  const html = renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(AuditTrailWorkspace, {
      ...trailProps,
      resourceType: "contract",
      resourceId: "contract-1"
    }))
  );
  assert(!html.includes("走到哪了"), "合同只有 create / close 两个动作，不构成流程");
}
