/**
 * 财税业务链路条（Phase 9 · F1）
 * 全站统一的主线导航：经营事项→任务→单据→凭证→账簿→报表→税务→风险→归档→审计。
 * 高亮当前环节，各环节可点跳转，呈现「上一步/下一步」业务顺序。
 */
import React from "react";
import { useNavigate } from "react-router-dom";
import { Tooltip } from "antd";
import { RightOutlined } from "@ant-design/icons";

export type FlowStageKey =
  | "events" | "tasks" | "documents" | "vouchers" | "ledger"
  | "reports" | "tax" | "risk" | "archive" | "audit";

interface Stage { key: FlowStageKey; label: string; path: string; hint: string }

const STAGES: Stage[] = [
  { key: "events", label: "经营事项", path: "/events", hint: "识别经营动作，作为一切财税处理的起点" },
  { key: "tasks", label: "任务分派", path: "/tasks", hint: "把事项拆解分派到岗位执行" },
  { key: "documents", label: "单据补齐", path: "/documents", hint: "补齐发票、回单、审批等原始资料" },
  { key: "vouchers", label: "凭证记账", path: "/vouchers", hint: "据单据生成并审核记账凭证" },
  { key: "ledger", label: "账簿过账", path: "/ledger", hint: "过账形成总账明细账，期末锁账" },
  { key: "reports", label: "财务报表", path: "/reports", hint: "生成三大报表与快照" },
  { key: "tax", label: "税务申报", path: "/tax", hint: "计算税额、生成申报资料并提交" },
  { key: "risk", label: "风险勾稽", path: "/risk", hint: "勾稽校验，发现并整改异常" },
  { key: "archive", label: "归档留档", path: "/pdf-export", hint: "导出资料包，归档留存" },
  { key: "audit", label: "审计追溯", path: "/audit", hint: "全程操作留痕，可追溯审查" },
];

export function FinanceFlowBar({ current }: { current: FlowStageKey }) {
  const navigate = useNavigate();
  const currentIdx = STAGES.findIndex((s) => s.key === current);

  return (
    <div className="v3-section-shell" data-tone="muted" style={{ padding: "12px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, overflowX: "auto", paddingBottom: 2 }}>
        {STAGES.map((s, i) => {
          const isCurrent = s.key === current;
          const isDone = i < currentIdx;
          return (
            <div key={s.key} style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
              <Tooltip title={s.hint}>
                <button
                  onClick={() => navigate(s.path)}
                  aria-current={isCurrent ? "step" : undefined}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer",
                    border: "none", borderRadius: 999, padding: "5px 12px", fontSize: 12.5,
                    whiteSpace: "nowrap", transition: "all .15s",
                    background: isCurrent ? "linear-gradient(135deg,#2563eb,#7c3aed)" : isDone ? "rgba(22,163,74,0.1)" : "rgba(20,40,60,0.05)",
                    color: isCurrent ? "#fff" : isDone ? "#15803d" : "#64748b",
                    fontWeight: isCurrent ? 700 : 500,
                  }}>
                  <span style={{
                    width: 16, height: 16, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, background: isCurrent ? "rgba(255,255,255,0.25)" : isDone ? "#16a34a" : "rgba(20,40,60,0.15)",
                    color: isCurrent || isDone ? "#fff" : "#64748b",
                  }}>{isDone ? "✓" : i + 1}</span>
                  {s.label}
                </button>
              </Tooltip>
              {i < STAGES.length - 1 && <RightOutlined style={{ fontSize: 9, color: "#cbd5e1", margin: "0 1px" }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
