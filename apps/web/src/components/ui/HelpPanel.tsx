import React, { type CSSProperties, type ReactNode } from "react";
import { QuestionCircleOutlined } from "@ant-design/icons";

/**
 * V7 J4 统一帮助面板：跟随既有各页 HelpModal 的浮层形态，
 * 提供标准五段结构（每段可选）+ 自定义节点插槽（children）。
 * 触发按钮见 HelpTriggerButton。
 */

export interface HelpPanelProps {
  open: boolean;
  title: string;
  onClose: () => void;
  /** 本页负责什么 */
  responsibility?: ReactNode;
  /** 上下游关系（高亮蓝底框） */
  relations?: ReactNode;
  /** 标准流程（有序步骤） */
  workflowSteps?: readonly ReactNode[];
  /** 常见操作 */
  operations?: ReactNode;
  /** ⚠️ 注意事项（琥珀色提示框） */
  caution?: ReactNode;
  /** 自定义节点（如风险级别解释表），插入在注意事项之前 */
  children?: ReactNode;
}

const OVERLAY_STYLE: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center"
};

const PANEL_STYLE: CSSProperties = {
  background: "#fff",
  borderRadius: "16px",
  padding: "28px 32px",
  maxWidth: "560px",
  width: "92%",
  boxShadow: "0 8px 40px rgba(0,0,0,0.2)",
  maxHeight: "85vh",
  overflowY: "auto"
};

const RELATIONS_STYLE: CSSProperties = {
  background: "rgba(79,142,247,0.06)",
  borderRadius: "10px",
  padding: "14px 16px",
  border: "1px solid rgba(79,142,247,0.2)"
};

const CAUTION_STYLE: CSSProperties = {
  background: "rgba(255,165,0,0.08)",
  borderRadius: "8px",
  padding: "10px 14px",
  fontSize: "12.5px",
  color: "#b45309"
};

export function HelpPanel({
  open,
  title,
  onClose,
  responsibility,
  relations,
  workflowSteps,
  operations,
  caution,
  children
}: HelpPanelProps) {
  if (!open) return null;

  return (
    <div style={OVERLAY_STYLE} onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div style={PANEL_STYLE} onClick={(event) => event.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>{title}</h3>
          <button
            onClick={onClose}
            aria-label="关闭说明"
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "#9aa5b4" }}
          >
            ✕
          </button>
        </div>
        <div style={{ display: "grid", gap: "14px", fontSize: "13.5px", lineHeight: 1.75 }}>
          {relations ? (
            <div style={RELATIONS_STYLE}>
              <strong>上下游关系</strong>
              <div>{relations}</div>
            </div>
          ) : null}
          {workflowSteps && workflowSteps.length > 0 ? (
            <div>
              <strong>标准流程</strong>
              <ol style={{ margin: "6px 0 0 18px", padding: 0 }}>
                {workflowSteps.map((step, index) => (
                  <li key={index}>{step}</li>
                ))}
              </ol>
            </div>
          ) : null}
          {responsibility ? (
            <div>
              <strong>本页负责什么</strong>
              <div>{responsibility}</div>
            </div>
          ) : null}
          {operations ? (
            <div>
              <strong>常见操作</strong>
              <div>{operations}</div>
            </div>
          ) : null}
          {children}
          {caution ? <div style={CAUTION_STYLE}>⚠️ {caution}</div> : null}
        </div>
      </div>
    </div>
  );
}

interface HelpTriggerButtonProps {
  onClick: () => void;
  /** 无障碍标签与悬停提示，默认「查看本页操作说明」 */
  label?: string;
}

/** 标准帮助触发按钮：圆形问号（QuestionCircleOutlined）。 */
export function HelpTriggerButton({ onClick, label = "查看本页操作说明" }: HelpTriggerButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        width: 32,
        height: 32,
        borderRadius: "999px",
        border: "1px solid var(--line, #d5dde6)",
        background: "var(--panel, #fff)",
        color: "var(--text-main, #1e2a37)",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 15
      }}
    >
      <QuestionCircleOutlined />
    </button>
  );
}
