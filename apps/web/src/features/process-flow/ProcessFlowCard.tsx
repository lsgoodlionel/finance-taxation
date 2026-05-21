import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMenu } from "../../lib/api";
import {
  getDefaultProcessFlowNodeId,
  getProcessFlowBranchDefinition,
  getProcessFlowNodesForBranch,
  getProcessFlowOverviewSections
} from "./definition";
import { ProcessFlowLegend } from "./ProcessFlowLegend";
import { resolveProcessFlowState } from "./resolve";
import type {
  ProcessFlowBranch,
  ProcessFlowNode,
  ProcessFlowNodeStatus,
  ProcessFlowResolvedNode
} from "./types";

const STATUS_STYLE: Record<
  ProcessFlowNodeStatus,
  {
    borderColor: string;
    background: string;
    accent: string;
    shadow: string;
  }
> = {
  pending: {
    borderColor: "rgba(148, 163, 184, 0.28)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.94))",
    accent: "var(--c-text-muted)",
    shadow: "0 10px 24px rgba(148,163,184,0.08)"
  },
  current: {
    borderColor: "rgba(37, 99, 235, 0.35)",
    background: "linear-gradient(180deg, rgba(239,246,255,0.98), rgba(219,234,254,0.72))",
    accent: "var(--c-primary)",
    shadow: "0 14px 28px rgba(37,99,235,0.16)"
  },
  done: {
    borderColor: "rgba(22, 163, 74, 0.35)",
    background: "linear-gradient(180deg, rgba(240,253,244,0.98), rgba(220,252,231,0.72))",
    accent: "var(--c-success)",
    shadow: "0 12px 24px rgba(22,163,74,0.14)"
  },
  blocked: {
    borderColor: "rgba(220, 38, 38, 0.35)",
    background: "linear-gradient(180deg, rgba(254,242,242,0.98), rgba(254,226,226,0.72))",
    accent: "var(--c-danger)",
    shadow: "0 12px 24px rgba(220,38,38,0.14)"
  }
};

function nodeButtonLabel(target?: string) {
  if (!target) {
    return "查看节点详情";
  }

  return `进入 ${target}`;
}

function renderList(title: string, items: string[]) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: "var(--c-text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.05em"
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--c-text)" }}>
        {items.length > 0 ? items.join(" / ") : "无"}
      </div>
    </div>
  );
}

function getBranchBadgeClassName(branch: ProcessFlowBranch) {
  return getProcessFlowBranchDefinition(branch)?.badgeClassName ?? "badge-gray";
}

function getBranchLabel(branch: ProcessFlowBranch) {
  return getProcessFlowBranchDefinition(branch)?.label ?? branch;
}

function resolveDefaultNavigationTarget(node: ProcessFlowNode) {
  return node.routes[0];
}

function buildResolvedNodeMap(nodes?: ProcessFlowResolvedNode[]) {
  return new Map((nodes ?? []).map((node) => [node.id, node]));
}

function ProcessFlowNodeCard({
  node,
  businessEventId,
  onClick,
  isInteractive,
  navigationHint,
  interactionLabel
}: {
  node: ProcessFlowResolvedNode;
  businessEventId?: string;
  onClick?: (node: ProcessFlowResolvedNode) => void;
  isInteractive: boolean;
  navigationHint?: string;
  interactionLabel: string;
}) {
  const statusStyle = STATUS_STYLE[node.status];
  const content = (
    <>
      <div className="flex-between" style={{ alignItems: "flex-start", gap: 12 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <div className="flex-row" style={{ flexWrap: "wrap" }}>
            <span className={`badge ${getBranchBadgeClassName(node.branch)}`}>{getBranchLabel(node.branch)}</span>
            <span
              className="badge"
              style={{
                background: "rgba(255,255,255,0.72)",
                color: statusStyle.accent,
                border: `1px solid ${statusStyle.borderColor}`
              }}
            >
              {node.status === "current"
                ? "当前节点"
                : node.status === "done"
                  ? "已完成"
                  : node.status === "blocked"
                    ? "阻塞"
                    : "待处理"}
            </span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--c-text)" }}>{node.title}</div>
        </div>
        {isInteractive && <span style={{ color: statusStyle.accent, fontSize: 18, lineHeight: 1 }}>→</span>}
      </div>

      <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--c-text-muted)" }}>{node.description}</div>

      <div style={{ display: "grid", gap: 10 }}>
        {renderList("牵头部门", node.departments)}
        {renderList("关键单据", node.documents)}
        {renderList("税务要点", node.taxes)}
        {renderList("凭证线索", node.vouchers)}
      </div>

      {navigationHint && <div className="text-muted text-sm">{navigationHint}</div>}
    </>
  );
  const sharedStyle = {
    width: "100%",
    textAlign: "left" as const,
    borderRadius: 18,
    border: `1px solid ${statusStyle.borderColor}`,
    background: statusStyle.background,
    boxShadow: statusStyle.shadow,
    padding: 16,
    display: "grid",
    gap: 12
  };

  if (!isInteractive) {
    return <div style={sharedStyle}>{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => onClick?.(node)}
      style={{ ...sharedStyle, cursor: "pointer" }}
      aria-label={businessEventId ? `${interactionLabel}，事项 ${businessEventId}` : interactionLabel}
    >
      {content}
    </button>
  );
}

export interface ProcessFlowCardProps {
  mode?: "full" | "compact";
  title?: string;
  subtitle?: string;
  activeBranch?: ProcessFlowBranch;
  currentNodeId?: string;
  businessEventId?: string;
  nodes?: ProcessFlowResolvedNode[];
  onNodeClick?: (node: ProcessFlowResolvedNode) => void;
  getNodeNavigationTarget?: (node: ProcessFlowResolvedNode) => string | undefined;
}

export function ProcessFlowCard({
  mode = "full",
  title = "标准业务处理流程",
  subtitle = "覆盖外购物品与业务招待，从事项识别到税务归档。",
  activeBranch,
  currentNodeId,
  businessEventId,
  nodes,
  onNodeClick,
  getNodeNavigationTarget
}: ProcessFlowCardProps) {
  const navigate = useNavigate();
  const [allowedRoutes, setAllowedRoutes] = useState<Set<string> | null>(null);
  const overviewSections = getProcessFlowOverviewSections();
  const defaultCurrentNodeId = getDefaultProcessFlowNodeId(activeBranch ?? "common");
  const contextualState = activeBranch
    ? resolveProcessFlowState(activeBranch, currentNodeId ?? defaultCurrentNodeId)
    : null;
  const contextualNodes = nodes ?? contextualState?.nodes ?? [];
  const resolvedNodeMap = buildResolvedNodeMap(contextualNodes);
  const cardsPerRow = mode === "compact" ? "repeat(auto-fit, minmax(220px, 1fr))" : "repeat(auto-fit, minmax(240px, 1fr))";
  const renderedNodeCount = activeBranch
    ? contextualNodes.length || getProcessFlowNodesForBranch(activeBranch).length
    : overviewSections.reduce((count, section) => count + section.nodes.length, 0);
  const currentNodeTitle = contextualNodes.find((node) => node.id === (currentNodeId ?? contextualState?.currentNodeId))?.title;

  function resolveNodeNavigationTarget(node: ProcessFlowResolvedNode) {
    return getNodeNavigationTarget?.(node) ?? resolveDefaultNavigationTarget(node);
  }

  useEffect(() => {
    let active = true;
    void getMenu()
      .then((payload) => {
        if (!active) return;
        setAllowedRoutes(new Set(payload.items.map((item) => item.route)));
      })
      .catch(() => {
        if (!active) return;
        setAllowedRoutes(null);
      });

    return () => {
      active = false;
    };
  }, []);

  function hasRoutePermission(route?: string) {
    if (!route) {
      return false;
    }

    if (!allowedRoutes) {
      return true;
    }

    return allowedRoutes.has(route);
  }

  function handleNodeClick(node: ProcessFlowResolvedNode) {
    const nextRoute = resolveNodeNavigationTarget(node);
    onNodeClick?.(node);
    if (!nextRoute) {
      return;
    }
    navigate(nextRoute, {
      state: {
        businessEventId,
        processFlowNodeId: node.id
      }
    });
  }

  function renderNodeGrid(nodes: ProcessFlowResolvedNode[]) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: cardsPerRow, gap: 14 }}>
        {nodes.map((node) => {
          const navigationTarget = resolveNodeNavigationTarget(node);
          const canNavigate = hasRoutePermission(navigationTarget);
          const interactionLabel = canNavigate
            ? nodeButtonLabel(navigationTarget)
            : navigationTarget
              ? `无权限访问 ${navigationTarget}`
              : nodeButtonLabel(undefined);

          return (
            <ProcessFlowNodeCard
              key={node.id}
              node={node}
              businessEventId={businessEventId}
              isInteractive={Boolean((onNodeClick || navigationTarget) && canNavigate)}
              navigationHint={
                navigationTarget
                  ? canNavigate
                    ? `点击跳转: ${navigationTarget}`
                    : `无权限访问: ${navigationTarget}`
                  : undefined
              }
              interactionLabel={interactionLabel}
              onClick={handleNodeClick}
            />
          );
        })}
      </div>
    );
  }

  return (
    <section className="card">
      <div className="card-header">
        <div style={{ display: "grid", gap: 6 }}>
          <span className="card-title">{title}</span>
          <div className="text-muted text-sm">{subtitle}</div>
        </div>
        <div className="flex-row" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
          <span className="badge badge-gray">{renderedNodeCount} 个节点</span>
          {activeBranch && (
            <span className={`badge ${getBranchBadgeClassName(activeBranch)}`}>{getBranchLabel(activeBranch)}</span>
          )}
          {(currentNodeId ?? contextualState?.currentNodeId) && (
            <span className="badge badge-green">当前: {currentNodeTitle ?? currentNodeId ?? contextualState?.currentNodeId}</span>
          )}
        </div>
      </div>

      <div className="card-body" style={{ display: "grid", gap: mode === "compact" ? 16 : 20 }}>
        <ProcessFlowLegend compact={mode === "compact"} />

        {activeBranch ? (
          renderNodeGrid(contextualNodes)
        ) : (
          <div style={{ display: "grid", gap: 18 }}>
            {overviewSections.map((section) => {
              const resolvedNodes: ProcessFlowResolvedNode[] = section.nodes.map(
                (node) => resolvedNodeMap.get(node.id) ?? { ...node, status: "pending" as const }
              );

              if (section.kind === "linear") {
                return <div key={section.id}>{renderNodeGrid(resolvedNodes)}</div>;
              }

              return (
                <div
                  key={section.id}
                  style={{
                    border: `1px dashed ${section.borderColor ?? "rgba(20,40,60,0.14)"}`,
                    borderRadius: 20,
                    padding: 14,
                    display: "grid",
                    gap: 12,
                    background: section.background ?? "rgba(248,250,252,0.72)"
                  }}
                >
                  <div className="flex-between">
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--c-text)" }}>
                      {section.title ?? getBranchLabel(section.branch)}
                    </span>
                    <span className={`badge ${section.badgeClassName ?? getBranchBadgeClassName(section.branch)}`}>
                      {getBranchLabel(section.branch)}
                    </span>
                  </div>
                  {renderNodeGrid(resolvedNodes)}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
