import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReportSnapshot } from "@finance-taxation/domain-model";
import { ReportsSidebar } from "./ReportsSidebar";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const noop = () => undefined;

function renderSidebar(mode?: "guided" | "pro"): string {
  return renderToStaticMarkup(
    createElement(ReportsSidebar, {
      mode,
      periodType: "month",
      year: 2026,
      month: 6,
      quarter: 2,
      snapshots: [] as ReportSnapshot[],
      fromSnapshotId: "",
      toSnapshotId: "",
      activeView: "chairman",
      onPeriodTypeChange: noop,
      onYearChange: noop,
      onMonthChange: noop,
      onQuarterChange: noop,
      onSelectFrom: noop,
      onSelectTo: noop,
      onSelectView: noop,
      onReload: noop,
      onSaveSnapshot: noop,
      onGenerateDiff: noop,
      onGenerateSummary: noop,
      onOpenPrintable: noop,
      onOpenBundle: noop
    })
  );
}

// ── guided：老板摘要优先，专业报表与工具折叠 ─────────────────────────────────
const guidedHtml = renderSidebar("guided");
assert(guidedHtml.includes("老板摘要（白话讲结论）"), "expected guided chairman-first view button");
assert(guidedHtml.includes("查看专业报表"), "expected professional views folded behind an entry");
assert(guidedHtml.includes("财务专业工具"), "expected pro tools folded in guided mode");
assert(guidedHtml.includes("<details"), "expected collapsed details sections in guided mode");
assert(guidedHtml.includes("资产负债表"), "expected professional views still reachable inside fold");

// ── pro：结构与文案保持不变 ──────────────────────────────────────────────────
const proHtml = renderSidebar("pro");
assert(!proHtml.includes("<details"), "expected no folding in pro mode");
assert(proHtml.includes("老板摘要"), "expected chairman view label in pro list");
assert(!proHtml.includes("老板摘要（白话讲结论）"), "expected pro to keep professional label");
assert(proHtml.includes("保存资产负债表快照"), "expected snapshot action visible in pro mode");
assert(proHtml.includes("输出动作"), "expected output section visible in pro mode");

// mode 缺省 → pro 行为
const defaultHtml = renderSidebar(undefined);
assert(!defaultHtml.includes("<details"), "expected default mode to behave as pro");
