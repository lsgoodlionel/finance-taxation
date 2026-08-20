import React from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { buildResultPageSubtitle } from "../../lib/entry-guidance";

type TaxHeaderProps = {
  activeMaterialLabel: string;
};

/**
 * 税务中心的页头。
 *
 * ## V15：删掉了手写的「?」按钮
 *
 * `PageHeader` 自己会渲染「本页指南」，这里再放一个问号就成了两个说明入口
 * ——用户报的正是这个。**页面右上角只保留一个**：两个问号会让人以为
 * 自己点错了，或者以为两个点开的是不同的东西。
 *
 * 原来那个帮助浮层的独有内容（税务事项的五个状态、上下游关系）
 * 已经合并进 `page-guides` 的税务中心那一条，一句没丢。
 */
export function TaxHeader({ activeMaterialLabel }: TaxHeaderProps) {
  return (
    <PageHeader
      title="税务中心"
      subtitle={buildResultPageSubtitle("税务中心")}
      actions={(
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", alignItems: "flex-end" }}>
            <span style={{ fontSize: "12px", color: "#6c7a89" }}>当前资料视图</span>
            <strong style={{ fontSize: "14px", color: "#1e2a37" }}>{activeMaterialLabel}</strong>
          </div>
        </div>
      )}
    />
  );
}
