import React from "react";
import type { ReportSnapshot } from "@finance-taxation/domain-model";
import { ResultBanner } from "../../components/ui/ResultBanner";
import type { BundleKind, ReportsPeriodState, ReportsWorkbenchView } from "./report-types";
import { formatSnapshotLabel, getSnapshotSelectionLabel, getWorkbenchViewLabel } from "./reports-helpers";

type ReportsSidebarProps = ReportsPeriodState & {
  snapshots: ReportSnapshot[];
  fromSnapshotId: string;
  toSnapshotId: string;
  activeView: ReportsWorkbenchView;
  onPeriodTypeChange: (value: ReportsPeriodState["periodType"]) => void;
  onYearChange: (value: number) => void;
  onMonthChange: (value: number) => void;
  onQuarterChange: (value: number) => void;
  onSelectFrom: (snapshotId: string) => void;
  onSelectTo: (snapshotId: string) => void;
  onSelectView: (view: ReportsWorkbenchView) => void;
  onReload: () => void;
  onSaveSnapshot: () => void;
  onGenerateDiff: () => void;
  onGenerateSummary: () => void;
  onOpenPrintable: () => void;
  onOpenBundle: (kind: BundleKind) => void;
};

const views: ReportsWorkbenchView[] = [
  "balanceSheet",
  "profitStatement",
  "cashFlow",
  "diff",
  "chairman"
];

function cardStyle() {
  return {
    display: "grid",
    gap: "16px",
    padding: "20px",
    borderRadius: "20px",
    background: "rgba(255,255,255,0.88)",
    border: "1px solid rgba(20,40,60,0.08)"
  } as const;
}

function sectionTitleStyle() {
  return {
    fontSize: "12px",
    color: "#6c7a89",
    textTransform: "uppercase" as const,
    letterSpacing: "0.06em",
    fontWeight: 700
  };
}

export function ReportsSidebar(props: ReportsSidebarProps) {
  const {
    periodType,
    year,
    month,
    quarter,
    snapshots,
    fromSnapshotId,
    toSnapshotId,
    activeView,
    onPeriodTypeChange,
    onYearChange,
    onMonthChange,
    onQuarterChange,
    onSelectFrom,
    onSelectTo,
    onSelectView,
    onReload,
    onSaveSnapshot,
    onGenerateDiff,
    onGenerateSummary,
    onOpenPrintable,
    onOpenBundle
  } = props;

  return (
    <aside style={{ display: "grid", gap: "20px", position: "sticky", top: "16px" }}>
      <section style={cardStyle()}>
        <div style={{ display: "grid", gap: "4px" }}>
          <span style={sectionTitleStyle()}>期间上下文</span>
          <strong style={{ fontSize: "16px", color: "#1e2a37" }}>先固定报表口径，再决定查看和输出</strong>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
            gap: "10px"
          }}
        >
          <div style={{ padding: "10px 12px", borderRadius: "14px", background: "rgba(15,118,110,0.08)" }}>
            <div style={{ fontSize: "11px", color: "#0f766e" }}>当前期间</div>
            <strong style={{ fontSize: "14px", color: "#134e4a" }}>
              {periodType === "month" ? `${year}-${String(month).padStart(2, "0")}` : periodType === "quarter" ? `${year} Q${quarter}` : `${year}`}
            </strong>
          </div>
          <div style={{ padding: "10px 12px", borderRadius: "14px", background: "rgba(37,99,235,0.08)" }}>
            <div style={{ fontSize: "11px", color: "#1d4ed8" }}>快照数量</div>
            <strong style={{ fontSize: "14px", color: "#1e3a8a" }}>{snapshots.length}</strong>
          </div>
        </div>
        <div style={{ display: "grid", gap: "10px" }}>
          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontSize: "12px", color: "#6c7a89" }}>期间类型</span>
            <select value={periodType} onChange={(event) => onPeriodTypeChange(event.target.value as ReportsPeriodState["periodType"])}>
              <option value="month">月度</option>
              <option value="quarter">季度</option>
              <option value="year">年度</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontSize: "12px", color: "#6c7a89" }}>年份</span>
            <input type="number" value={year} onChange={(event) => onYearChange(Number(event.target.value || 2026))} />
          </label>
          {periodType === "month" ? (
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "#6c7a89" }}>月份</span>
              <input type="number" min={1} max={12} value={month} onChange={(event) => onMonthChange(Number(event.target.value || 1))} />
            </label>
          ) : null}
          {periodType === "quarter" ? (
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "#6c7a89" }}>季度</span>
              <input type="number" min={1} max={4} value={quarter} onChange={(event) => onQuarterChange(Number(event.target.value || 1))} />
            </label>
          ) : null}
          <div style={{ display: "grid", gap: "8px" }}>
            <button className="btn btn-primary" onClick={onReload}>更新报表</button>
            <button className="btn btn-outline" onClick={onSaveSnapshot}>保存资产负债表快照</button>
          </div>
        </div>
      </section>

      <section style={cardStyle()}>
        <div style={{ display: "grid", gap: "4px" }}>
          <span style={sectionTitleStyle()}>工作台视图</span>
          <div style={{ fontSize: "13px", color: "#4d5d6c" }}>右侧只显示当前关注的结果，避免三表与分析结果混在同一长页里。</div>
        </div>
        <div style={{ display: "grid", gap: "8px" }}>
          {views.map((view) => {
            const selected = activeView === view;
            return (
              <button
                key={view}
                onClick={() => onSelectView(view)}
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  borderRadius: "12px",
                  border: selected ? "1px solid rgba(37,99,235,0.4)" : "1px solid rgba(20,40,60,0.08)",
                  background: selected ? "rgba(37,99,235,0.08)" : "rgba(248,250,252,0.9)",
                  color: selected ? "#1d4ed8" : "#1e2a37",
                  cursor: "pointer",
                  fontWeight: selected ? 700 : 500
                }}
              >
                {getWorkbenchViewLabel(view)}
              </button>
            );
          })}
        </div>
      </section>

      <section style={cardStyle()}>
        <div style={{ display: "grid", gap: "4px" }}>
          <span style={sectionTitleStyle()}>快照与对比</span>
          <div style={{ fontSize: "13px", color: "#4d5d6c" }}>
            先选基准和对比，再显式生成差异分析或老板摘要。
          </div>
        </div>
        <ResultBanner tone="info" message={`基准：${getSnapshotSelectionLabel(fromSnapshotId, snapshots)} ｜ 对比：${getSnapshotSelectionLabel(toSnapshotId, snapshots)}`} />
        <div style={{ display: "grid", gap: "10px", maxHeight: "320px", overflowY: "auto" }}>
          {snapshots.length === 0 ? (
            <div style={{ fontSize: "13px", color: "#94a3b8" }}>暂无快照，请先保存资产负债表快照。</div>
          ) : snapshots.map((snapshot, index) => {
            const isFrom = fromSnapshotId === snapshot.id;
            const isTo = toSnapshotId === snapshot.id;
            return (
              <div
                key={snapshot.id}
                style={{
                  display: "grid",
                  gap: "10px",
                  padding: "12px",
                  borderRadius: "14px",
                  border: "1px solid rgba(20,40,60,0.08)",
                  background: isFrom ? "rgba(37,99,235,0.08)" : isTo ? "rgba(22,163,74,0.08)" : "#fff"
                }}
              >
                <div style={{ display: "grid", gap: "4px" }}>
                  <strong style={{ fontSize: "13px", color: "#1e2a37" }}>{formatSnapshotLabel(snapshot)}</strong>
                  <span style={{ fontSize: "11px", color: "#9aa5b4", fontFamily: "monospace" }}>
                    SNP-{String(index + 1).padStart(3, "0")} · {snapshot.snapshotDate}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button className="btn btn-outline" onClick={() => onSelectFrom(snapshot.id)}>设为基准</button>
                  <button className="btn btn-outline" onClick={() => onSelectTo(snapshot.id)}>设为对比</button>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "grid", gap: "8px" }}>
          <button className="btn btn-primary" onClick={onGenerateDiff}>生成差异分析</button>
          <button className="btn btn-outline" onClick={onGenerateSummary}>生成老板摘要</button>
        </div>
      </section>

      <section style={cardStyle()}>
        <div style={{ display: "grid", gap: "4px" }}>
          <span style={sectionTitleStyle()}>输出动作</span>
          <div style={{ fontSize: "13px", color: "#4d5d6c" }}>右侧先确认结果，再决定打印或打包输出。</div>
        </div>
        <div style={{ display: "grid", gap: "8px" }}>
          <button className="btn btn-outline" onClick={onOpenPrintable}>打开打印版</button>
          <button className="btn btn-outline" onClick={() => onOpenBundle("month_end")}>月结资料包</button>
          <button className="btn btn-outline" onClick={() => onOpenBundle("audit")}>审计资料包</button>
          <button className="btn btn-outline" onClick={() => onOpenBundle("inspection")}>稽核资料包</button>
        </div>
      </section>
    </aside>
  );
}
