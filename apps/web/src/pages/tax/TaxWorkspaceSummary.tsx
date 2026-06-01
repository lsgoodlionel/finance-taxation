import React from "react";
import { EmptyState } from "../../components/ui/EmptyState";
import { miniStatStyle, panelStyle } from "./taxStyles";

type TaxWorkspaceSummaryProps = {
  itemCount: number;
  batchCount: number;
  profileCount: number;
  selectedBatchLabel: string;
  navEventId: string | null;
  navTaxItemId: string | null;
};

export function TaxWorkspaceSummary({
  itemCount,
  batchCount,
  profileCount,
  selectedBatchLabel,
  navEventId,
  navTaxItemId
}: TaxWorkspaceSummaryProps) {
  return (
    <article style={panelStyle()}>
      <div style={{ display: "grid", gap: "16px" }}>
        <div>
          <h3 style={{ margin: 0 }}>税务工作台摘要</h3>
          <p style={{ margin: "8px 0 0", color: "#5c6b7a", lineHeight: 1.7 }}>
            先确认纳税人口径与税率规则，再复核税务事项和申报批次，最后进入底稿、资料生成与打印。
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
          <div style={miniStatStyle()}>
            <div style={{ fontSize: "12px", color: "#6c7a89" }}>税务事项</div>
            <strong style={{ display: "block", marginTop: "8px", fontSize: "24px" }}>{itemCount}</strong>
          </div>
          <div style={miniStatStyle()}>
            <div style={{ fontSize: "12px", color: "#6c7a89" }}>申报批次</div>
            <strong style={{ display: "block", marginTop: "8px", fontSize: "24px" }}>{batchCount}</strong>
          </div>
          <div style={miniStatStyle()}>
            <div style={{ fontSize: "12px", color: "#6c7a89" }}>纳税人口径档案</div>
            <strong style={{ display: "block", marginTop: "8px", fontSize: "24px" }}>{profileCount}</strong>
          </div>
          <div style={miniStatStyle()}>
            <div style={{ fontSize: "12px", color: "#6c7a89" }}>当前批次</div>
            <strong style={{ display: "block", marginTop: "8px", fontSize: "16px" }}>{selectedBatchLabel || "未选择"}</strong>
          </div>
        </div>
        {navEventId || navTaxItemId ? (
          <div style={{ borderRadius: "14px", padding: "14px 16px", background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.14)", color: "#2563eb", fontSize: "13px", lineHeight: 1.7 }}>
            {navEventId
              ? <>当前按事项 <strong>{navEventId}</strong> 收窄税务上下文，便于直接复核关联税务结果。</>
              : <>当前高亮税务事项 <strong>{navTaxItemId}</strong>，方便在批次与资料区继续追踪。</>}
          </div>
        ) : (
          <div style={{ borderRadius: "14px", padding: "14px 16px", background: "rgba(20,40,60,0.04)", border: "1px solid rgba(20,40,60,0.08)" }}>
            <EmptyState
              title="当前无上游 drilldown 限定"
              description="你可以从经营事项、单据或凭证页进入本页，也可以直接在本页按批次和资料类型完成复核。"
            />
          </div>
        )}
      </div>
    </article>
  );
}
