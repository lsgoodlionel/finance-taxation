import React from "react";
import { Term } from "../../components/ui/Term";

type DocumentsHeaderProps = {
  onOpenHelp: () => void;
};

/**
 * 单据这件事的一句话指引 + 业务说明入口。
 *
 * V10：原来这里是一整个 PageHeader（标题「单据中心」+ 副标题 + 帮助按钮）再加一条
 * 指引横幅，和 /bills 容器的页头撞在同一屏。标题已上交容器（容器标题随当前这件事走），
 * 这里只留指引与帮助入口，并入概览区，不再自成一块。
 */
export function DocumentsHeader({ onOpenHelp }: DocumentsHeaderProps) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
      <p style={{ margin: 0, fontSize: "13px", color: "#4d5d6c", lineHeight: 1.7, flex: "1 1 320px" }}>
        先看资料完整度（缺附件 / 待审 / 已<Term k="archive">归档</Term>），再从左侧选一张，补齐附件并查看它挂在哪个事项上。
      </p>
      <button
        onClick={onOpenHelp}
        title="业务说明"
        aria-label="打开业务说明"
        style={{ width: "26px", height: "26px", borderRadius: "50%", border: "1.5px solid rgba(79,142,247,0.6)", background: "rgba(79,142,247,0.08)", color: "#4f8ef7", fontWeight: 700, fontSize: "13px", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
      >
        ?
      </button>
    </div>
  );
}
