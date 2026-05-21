import { PROCESS_FLOW_BRANCHES, PROCESS_FLOW_NODES } from "./definition";
import type { ProcessFlowBranch, ProcessFlowNodeStatus } from "./types";

const STATUS_META: Record<ProcessFlowNodeStatus, { label: string; tone: string }> = {
  pending: { label: "待处理", tone: "rgba(148, 163, 184, 0.18)" },
  current: { label: "当前", tone: "rgba(37, 99, 235, 0.16)" },
  done: { label: "已完成", tone: "rgba(22, 163, 74, 0.16)" },
  blocked: { label: "阻塞", tone: "rgba(220, 38, 38, 0.16)" }
};

function countNodes(branch: ProcessFlowBranch) {
  return PROCESS_FLOW_NODES.filter((node) => node.branch === branch).length;
}

interface ProcessFlowLegendProps {
  compact?: boolean;
}

export function ProcessFlowLegend({ compact = false }: ProcessFlowLegendProps) {
  return (
    <div style={{ display: "grid", gap: compact ? 10 : 14 }}>
      <div className="flex-row" style={{ flexWrap: "wrap", gap: 10 }}>
        {(Object.entries(STATUS_META) as Array<[ProcessFlowNodeStatus, { label: string; tone: string }]>).map(
          ([status, meta]) => (
            <span
              key={status}
              className="badge"
              style={{
                background: meta.tone,
                color: "var(--c-text)",
                border: "1px solid rgba(20,40,60,0.08)"
              }}
            >
              {meta.label}
            </span>
          )
        )}
      </div>

      <div className="flex-row" style={{ flexWrap: "wrap", gap: 10 }}>
        {PROCESS_FLOW_BRANCHES.map((branch) => (
          <span key={branch.branch} className={`badge ${branch.badgeClassName}`}>
            {branch.label} {countNodes(branch.branch)}
          </span>
        ))}
      </div>

      {!compact && (
        <div className="text-muted text-sm" style={{ lineHeight: 1.7 }}>
          节点由统一流程定义驱动。点击节点会跳转到对应业务页，节点下方会列出牵头部门、关键单据、税务口径和凭证线索。
        </div>
      )}
    </div>
  );
}
