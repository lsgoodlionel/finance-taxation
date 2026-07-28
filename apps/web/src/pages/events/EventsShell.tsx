/**
 * /events 的页面骨架。
 *
 * 改造前首屏是 8 个平级区块，其中「新建事项表单」占左栏 1.2fr 与事项列表并排常驻，
 * 详情又压在列表下方（实测 1269px 高），一屏根本装不下「选哪一笔 + 这一笔怎么样」。
 *
 * 现在只剩三块：页头（含 guided 提示、标题、新建入口与帮助）、全站流程导航条、
 * 以及一个工作区——左边选事项、右边就是这一笔。新建表单收进对话框
 * （EventCreateModal）。页头用语义化的 <header> 收拢，guided 兜底横幅属于
 * 「关于这一页的说明」，本来就该和标题在一起，而不是自成一条页面级横幅。
 */
import React, { type ReactNode } from "react";
import { FinanceFlowBar } from "../../components/FinanceFlowBar";

type EventsShellProps = {
  header: ReactNode;
  /** 操作结果提示，贴在工作区顶部而不是自成一块页面级横幅。 */
  banner?: ReactNode;
  listPanel: ReactNode;
  detailPanel: ReactNode;
};

const PAGE_STYLE: React.CSSProperties = { display: "grid", gap: 20 };

const WORKSPACE_STYLE: React.CSSProperties = { display: "grid", gap: 12, minWidth: 0 };

/**
 * 列表窄、详情宽：用户在列表里挑一笔，注意力应该落在右边这一笔上。
 * 两列都加 minmax(0, …)，避免表格内容把网格撑出横向滚动条。
 */
const SPLIT_STYLE: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 320px) minmax(0, 1fr)",
  gap: 20,
  alignItems: "start"
};

export function EventsShell({ header, banner, listPanel, detailPanel }: EventsShellProps) {
  return (
    <div style={PAGE_STYLE}>
      <header>{header}</header>
      <FinanceFlowBar current="events" />
      <div style={WORKSPACE_STYLE}>
        {banner}
        <div style={SPLIT_STYLE}>
          {listPanel}
          {detailPanel}
        </div>
      </div>
    </div>
  );
}
