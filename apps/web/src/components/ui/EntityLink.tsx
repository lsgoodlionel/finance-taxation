/**
 * V10「关联即链接」：把界面上裸露的对象 id 变成可点击的跳转。
 *
 * 现状问题：总账的「来源凭证」、凭证的「关联事项」、税务事项编号等，
 * 数据层关联是完备的（voucherId / businessEventId 等外键都在），
 * 但 UI 上只渲染成纯文本或 copyable —— 用户看得到关联却走不过去，
 * 只能手工把 id 抄进另一个页面的筛选框。
 *
 * 本组件统一走既有的 drilldown 机制（pages/drilldown.ts 的 state 约定），
 * 让"看到即可达"。
 */
import React from "react";
import { Typography } from "antd";
import { useNavigate } from "react-router-dom";
import type { DrilldownState } from "../../pages/drilldown";

const { Text } = Typography;

/** 可跳转的业务对象类型 —— 与 drilldown.ts 的 DrilldownState 字段一一对应。 */
export type EntityKind =
  | "business_event"
  | "voucher"
  | "document"
  | "task"
  | "tax_item"
  | "risk_finding"
  | "contract";

interface EntityRoute {
  /** 目标路由 */
  path: string;
  /**
   * 把 id 放进 DrilldownState 的哪个字段。
   * 留空表示目标页只按 resourceType / resourceId 定位（见 task）。
   */
  stateKey?: keyof DrilldownState;
  /**
   * 目标页用查询参数（而不是 location.state）接收时的参数名。
   * 目标页存在这种接收方式时必须填，否则跳过去等于什么都没发生。
   */
  queryKey?: string;
}

/**
 * 对象类型的中文名。既用于链接的可访问名称（「打开凭证 VCH-001」），
 * 也用于把一堆关联对象按类型分组时的组标题（见 RelatedObjectsPanel）——
 * 两处共用一份，避免同一类型在不同界面被叫成两个名字。
 */
export const ENTITY_KIND_LABELS: Record<EntityKind, string> = {
  business_event: "经营事项",
  voucher: "凭证",
  document: "单据",
  task: "任务",
  tax_item: "税务事项",
  risk_finding: "风险",
  contract: "合同"
};

/**
 * 每条路由的 stateKey / queryKey 都以「目标页真的会读它」为准，逐个核对过：
 * - EventsPage 用 useQueryState("event") 选中事项，完全不读 location.state，
 *   所以 business_event 必须带查询参数；state 一并保留，便于目标页后续接管。
 * - TasksPage 只按 businessEventId 过滤任务列表，没有按任务 id 过滤的语义，
 *   因此 task 不写 stateKey（写了会把任务 id 当事项 id 去过滤，得到空列表），
 *   改用 resourceType / resourceId，由 TasksPage 打开对应任务详情。
 * - voucher / document / tax_item / risk_finding / contract 的目标页均已用
 *   normalizeDrilldownState 读取同名字段，并据此选中或高亮。
 */
const ENTITY_ROUTES: Record<EntityKind, EntityRoute> = {
  business_event: { path: "/events", stateKey: "businessEventId", queryKey: "event" },
  voucher: { path: "/vouchers", stateKey: "voucherId" },
  document: { path: "/bills", stateKey: "documentId" },
  task: { path: "/tasks" },
  tax_item: { path: "/tax", stateKey: "taxItemId" },
  risk_finding: { path: "/risk", stateKey: "riskFindingId" },
  contract: { path: "/contracts", stateKey: "contractId" }
};

export interface EntityLinkProps {
  kind: EntityKind;
  /** 对象 id；为空时降级为纯文本占位，不渲染成链接。 */
  id: string | null | undefined;
  /** 展示文案；缺省用 id 本身。 */
  children?: React.ReactNode;
  /** id 为空时的占位文案。 */
  fallback?: React.ReactNode;
}

/** 构造跳转目标，供测试与非 React 场景复用。 */
export function buildEntityTarget(
  kind: EntityKind,
  id: string
): { path: string; state: DrilldownState } {
  const route = ENTITY_ROUTES[kind];
  const path = route.queryKey
    ? `${route.path}?${route.queryKey}=${encodeURIComponent(id)}`
    : route.path;
  return {
    path,
    state: {
      ...(route.stateKey ? { [route.stateKey]: id } : {}),
      resourceType: kind,
      resourceId: id
    } as DrilldownState
  };
}

export function EntityLink({ kind, id, children, fallback = "—" }: EntityLinkProps) {
  const navigate = useNavigate();
  if (!id) {
    return <Text type="secondary">{fallback}</Text>;
  }

  const target = buildEntityTarget(kind, id);
  const label = children ?? id;

  return (
    <a
      href={target.path}
      onClick={(event) => {
        // 链接常常落在可点击的表格行里；点链接就只走链接，不再触发行的选中。
        event.stopPropagation();
        // 保留 ⌘/Ctrl+点击在新标签打开的原生行为
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        navigate(target.path, { state: target.state });
      }}
      aria-label={`打开${ENTITY_KIND_LABELS[kind]} ${id}`}
      style={{ color: "var(--v3-color-primary, #2563eb)" }}
    >
      {label}
    </a>
  );
}
