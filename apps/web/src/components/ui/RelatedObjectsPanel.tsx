/**
 * V10「相关的东西都在这儿，点开就能去」。
 *
 * 要解决的问题：/events 的详情体里平铺了 6 张只读关联表（单据映射、已生成单据、
 * 税务映射、任务树、凭证草稿、时间轴），它们都不是用户此刻要操作的东西，却和
 * 真正的工作区抢同一屏。这些内容不该删——用户确实偶尔要顺藤摸瓜——但应该
 * 默认收起、按类型归拢、并且每一条都能点进去。
 *
 * 与 ObjectFlowBar 的分工：流程条讲「按时间顺序走到哪了」，本面板讲
 * 「这一路牵扯到哪些对象」。典型用法是把 collectRelatedObjects(flow) 的结果
 * 直接喂进来（见 lib/object-flow.ts，已去重保序）。
 *
 * 用原生 <details> 而不是 antd Collapse：展开/收起的键盘与读屏语义浏览器已经
 * 给全了，不需要自持 open 状态，SSR 也天然可用。仓库已有先例
 * （pages/reports/ReportsSidebar.tsx）。
 */
import React from "react";
import type { FlowRelatedObject } from "../../lib/object-flow";
import { ENTITY_KIND_LABELS, EntityLink, type EntityKind } from "./EntityLink";

export interface RelatedObjectsPanelProps {
  objects: readonly FlowRelatedObject[];
  title?: string;
  /** 默认收起——这里是「需要时再看」的内容，不该开屏就占地方。 */
  collapsedByDefault?: boolean;
}

interface ObjectGroup {
  kind: EntityKind;
  objects: readonly FlowRelatedObject[];
}

const SHELL_STYLE: React.CSSProperties = { padding: "12px 16px", display: "block" };

const SUMMARY_STYLE: React.CSSProperties = {
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  fontWeight: 600,
  color: "#4d5d6c",
  padding: "2px 0"
};

const COUNT_STYLE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: 20,
  height: 20,
  padding: "0 6px",
  borderRadius: 999,
  background: "rgba(20,40,60,0.08)",
  color: "#4d5d6c",
  fontSize: 12,
  fontWeight: 700
};

const BODY_STYLE: React.CSSProperties = { display: "grid", gap: 12, marginTop: 12 };

const GROUP_TITLE_STYLE: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.06em",
  color: "#6b7a8d",
  fontWeight: 700
};

const LINK_ROW_STYLE: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px 14px",
  listStyle: "none",
  margin: 0,
  padding: 0,
  fontSize: 13
};

/** 按类型分组；组的先后与组内顺序都沿用入参顺序（调用方的语义顺序更可靠）。 */
export function groupObjectsByKind(objects: readonly FlowRelatedObject[]): ObjectGroup[] {
  return objects.reduce<ObjectGroup[]>((groups, object) => {
    const index = groups.findIndex((group) => group.kind === object.kind);
    if (index === -1) {
      return [...groups, { kind: object.kind, objects: [object] }];
    }
    return groups.map((group, groupIndex) =>
      groupIndex === index ? { ...group, objects: [...group.objects, object] } : group
    );
  }, []);
}

export function RelatedObjectsPanel({
  objects,
  title = "相关的单子与记录",
  collapsedByDefault = true
}: RelatedObjectsPanelProps) {
  if (objects.length === 0) {
    return null;
  }

  const groups = groupObjectsByKind(objects);

  return (
    <details className="v3-section-shell" data-tone="muted" style={SHELL_STYLE} open={!collapsedByDefault}>
      <summary style={SUMMARY_STYLE}>
        <span>{title}</span>
        <span style={COUNT_STYLE}>{objects.length}</span>
      </summary>
      <div style={BODY_STYLE}>
        {groups.map((group) => (
          <div key={group.kind} style={{ display: "grid", gap: 6 }}>
            <span style={GROUP_TITLE_STYLE}>{ENTITY_KIND_LABELS[group.kind]}</span>
            <ul style={LINK_ROW_STYLE}>
              {group.objects.map((object) => (
                <li key={`${object.kind}:${object.id}`}>
                  <EntityLink kind={object.kind} id={object.id}>
                    {object.label ?? object.id}
                  </EntityLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}
