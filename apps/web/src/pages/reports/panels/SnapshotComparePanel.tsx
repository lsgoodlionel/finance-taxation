/**
 * 「对比两期变化」这件事的工作区。
 *
 * 改造前它是侧栏里的「快照与对比」卡片，和期间选择、视图选择、打包导出并排常驻，
 * 而差异结果却在页面另一侧——选快照和看差异被拆在两个地方。
 * 现在合成一件事：在这里存快照、挑基准与对比、生成结果，结果就在下面。
 *
 * 「月结 / 审计 / 稽核资料包」原来也钉在这一屏，现已移交 /export-center：
 * 那边是同一个 closing-bundle 接口的等价能力，还会把导出登记进导出历史与审计轨迹。
 */
import React from "react";
import type { ReportDiffResult, ReportSnapshot } from "@finance-taxation/domain-model";
import { Term } from "../../../components/ui/Term";
import { formatSnapshotLabel, getSnapshotSelectionLabel } from "../reports-helpers";
import { ReportDiffPanel } from "./ReportDiffPanel";

export type SnapshotComparePanelProps = {
  snapshots: ReportSnapshot[];
  fromSnapshotId: string;
  toSnapshotId: string;
  diff: ReportDiffResult | null;
  onSelectFrom: (snapshotId: string) => void;
  onSelectTo: (snapshotId: string) => void;
  onSaveSnapshot: () => void;
  onGenerateDiff: () => void;
  onGenerateSummary: () => void;
  onOpenPrintable: () => void;
  onOpenExportCenter: () => void;
};

const CARD_STYLE: React.CSSProperties = {
  display: "grid",
  gap: 16,
  padding: 20,
  borderRadius: 20,
  background: "rgba(255,255,255,0.88)",
  border: "1px solid rgba(20,40,60,0.08)"
};

const LIST_STYLE: React.CSSProperties = {
  display: "grid",
  gap: 10,
  maxHeight: 280,
  overflowY: "auto"
};

const ACTION_ROW_STYLE: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap" };

const HINT_STYLE: React.CSSProperties = { fontSize: 13, color: "#4d5d6c", margin: 0 };

function snapshotRowStyle(isFrom: boolean, isTo: boolean): React.CSSProperties {
  return {
    display: "grid",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    border: "1px solid rgba(20,40,60,0.08)",
    background: isFrom ? "rgba(37,99,235,0.08)" : isTo ? "rgba(22,163,74,0.08)" : "#fff"
  };
}

export function SnapshotComparePanel({
  snapshots,
  fromSnapshotId,
  toSnapshotId,
  diff,
  onSelectFrom,
  onSelectTo,
  onSaveSnapshot,
  onGenerateDiff,
  onGenerateSummary,
  onOpenPrintable,
  onOpenExportCenter
}: SnapshotComparePanelProps) {
  return (
    <>
      <section style={CARD_STYLE} aria-label="快照与对比">
        <p style={HINT_STYLE}>
          当前基准：{getSnapshotSelectionLabel(fromSnapshotId, snapshots)} ｜ 对比：
          {getSnapshotSelectionLabel(toSnapshotId, snapshots)}
        </p>
        <div style={LIST_STYLE}>
          {snapshots.length === 0 ? (
            <p style={HINT_STYLE}>
              还没有可对比的快照。先按当前期间存一份<Term k="balance-sheet">资产负债表</Term>快照，下期再回来对比。
            </p>
          ) : (
            snapshots.map((snapshot, index) => {
              const isFrom = fromSnapshotId === snapshot.id;
              const isTo = toSnapshotId === snapshot.id;
              return (
                <div key={snapshot.id} style={snapshotRowStyle(isFrom, isTo)}>
                  <div style={{ display: "grid", gap: 4 }}>
                    <strong style={{ fontSize: 13, color: "#1e2a37" }}>{formatSnapshotLabel(snapshot)}</strong>
                    <span style={{ fontSize: 11, color: "#9aa5b4", fontFamily: "monospace" }}>
                      SNP-{String(index + 1).padStart(3, "0")} · {snapshot.snapshotDate}
                    </span>
                  </div>
                  <div style={ACTION_ROW_STYLE}>
                    <button className="btn btn-outline" onClick={() => onSelectFrom(snapshot.id)}>
                      设为基准
                    </button>
                    <button className="btn btn-outline" onClick={() => onSelectTo(snapshot.id)}>
                      设为对比
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div style={ACTION_ROW_STYLE}>
          <button className="btn btn-outline" onClick={onSaveSnapshot}>
            保存本期快照
          </button>
          <button className="btn btn-primary" onClick={onGenerateDiff}>
            生成差异分析
          </button>
          <button className="btn btn-outline" onClick={onGenerateSummary}>
            生成老板摘要
          </button>
          <button className="btn btn-outline" onClick={onOpenPrintable}>
            打开打印版
          </button>
          <button className="btn btn-outline" onClick={onOpenExportCenter}>
            去导出中心打包月结 / 审计 / 稽核资料 →
          </button>
        </div>
      </section>
      <ReportDiffPanel diff={diff} />
    </>
  );
}
