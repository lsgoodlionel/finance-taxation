import { PageHeader } from "../../components/ui/PageHeader";
import { buildResultPageSubtitle } from "../../lib/entry-guidance";

type DocumentsHeaderProps = {
  onOpenHelp: () => void;
};

export function DocumentsHeader({ onOpenHelp }: DocumentsHeaderProps) {
  return (
    <div style={{ display: "grid", gap: "10px" }}>
      <PageHeader
        title="单据中心"
        subtitle={buildResultPageSubtitle("单据中心")}
        actions={(
          <button
            onClick={onOpenHelp}
            title="业务说明"
            aria-label="打开业务说明"
            style={{ width: "26px", height: "26px", borderRadius: "50%", border: "1.5px solid rgba(79,142,247,0.6)", background: "rgba(79,142,247,0.08)", color: "#4f8ef7", fontWeight: 700, fontSize: "13px", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
          >
            ?
          </button>
        )}
      />
      <div className="v3-banner" data-tone="info" style={{ fontSize: "13px" }}>
        先看单据资料完整度（缺附件 / 待审 / 已归档），再从左侧选择单据补齐附件、查看关联事项并归档。
      </div>
    </div>
  );
}
