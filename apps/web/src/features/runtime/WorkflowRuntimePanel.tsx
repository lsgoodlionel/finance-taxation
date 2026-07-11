import React from "react";
import type { WorkflowRuntimeSummary } from "./workflow-runtime";

const EXECUTION_TONE: Record<WorkflowRuntimeSummary["executionState"], { bg: string; border: string; color: string }> = {
  waiting: { bg: "rgba(148, 163, 184, 0.12)", border: "rgba(148, 163, 184, 0.2)", color: "#475569" },
  running: { bg: "rgba(37, 99, 235, 0.1)", border: "rgba(37, 99, 235, 0.18)", color: "#1d4ed8" },
  succeeded: { bg: "rgba(22, 163, 74, 0.1)", border: "rgba(22, 163, 74, 0.18)", color: "#166534" },
  failed: { bg: "rgba(220, 38, 38, 0.1)", border: "rgba(220, 38, 38, 0.18)", color: "#b91c1c" },
  cancelled: { bg: "rgba(100, 116, 139, 0.12)", border: "rgba(100, 116, 139, 0.18)", color: "#475569" }
};

const AUTH_TONE: Record<WorkflowRuntimeSummary["authorizationState"], { bg: string; border: string; color: string }> = {
  not_required: { bg: "rgba(148, 163, 184, 0.12)", border: "rgba(148, 163, 184, 0.2)", color: "#475569" },
  awaiting_authorization: { bg: "rgba(245, 158, 11, 0.12)", border: "rgba(245, 158, 11, 0.22)", color: "#b45309" },
  authorized: { bg: "rgba(22, 163, 74, 0.1)", border: "rgba(22, 163, 74, 0.18)", color: "#166534" },
  insufficient: { bg: "rgba(220, 38, 38, 0.1)", border: "rgba(220, 38, 38, 0.18)", color: "#b91c1c" }
};

export function WorkflowRuntimePanel({
  title,
  summary,
  onAction,
  busyActionKey
}: {
  title: string;
  summary: WorkflowRuntimeSummary;
  onAction?: (action: NonNullable<WorkflowRuntimeSummary["actions"]>[number]) => void;
  busyActionKey?: string | null;
}) {
  const executionTone = EXECUTION_TONE[summary.executionState];
  const authTone = AUTH_TONE[summary.authorizationState];

  return (
    <section
      style={{
        borderRadius: 20,
        border: "1px solid rgba(20,40,60,0.08)",
        background: "linear-gradient(180deg, rgba(255,255,255,0.94), rgba(246,249,252,0.96))",
        padding: 20,
        display: "grid",
        gap: 16
      }}
    >
      <div>
        <h3 style={{ margin: 0, fontSize: 18 }}>{title}</h3>
        <p style={{ margin: "8px 0 0", color: "#5c6b7a", lineHeight: 1.7 }}>
          本区显示当前页面对应业务链的执行态与授权态，帮助判断下一步是继续运行、等待复核还是转入修复。
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
        <article style={{ borderRadius: 16, padding: 16, background: executionTone.bg, border: `1px solid ${executionTone.border}` }}>
          <div style={{ fontSize: 12, color: "#6c7a89", marginBottom: 8 }}>运行态</div>
          <strong style={{ fontSize: 18, color: executionTone.color }}>{summary.executionLabel}</strong>
          <p style={{ margin: "8px 0 0", color: "#314155", lineHeight: 1.7 }}>{summary.executionMessage}</p>
        </article>
        <article style={{ borderRadius: 16, padding: 16, background: authTone.bg, border: `1px solid ${authTone.border}` }}>
          <div style={{ fontSize: 12, color: "#6c7a89", marginBottom: 8 }}>授权态</div>
          <strong style={{ fontSize: 18, color: authTone.color }}>{summary.authorizationLabel}</strong>
          <p style={{ margin: "8px 0 0", color: "#314155", lineHeight: 1.7 }}>{summary.authorizationMessage}</p>
        </article>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        {summary.stats.map((item) => (
          <div
            key={item.label}
            style={{
              borderRadius: 14,
              padding: "14px 16px",
              background: "rgba(20,40,60,0.04)",
              border: "1px solid rgba(20,40,60,0.08)"
            }}
          >
            <div style={{ fontSize: 12, color: "#6c7a89" }}>{item.label}</div>
            <strong style={{ display: "block", marginTop: 8, fontSize: 22 }}>{item.value}</strong>
          </div>
        ))}
      </div>
      {summary.issue ? (
        <article
          style={{
            borderRadius: 16,
            padding: 16,
            background:
              summary.issue.tone === "error"
                ? "rgba(220, 38, 38, 0.08)"
                : summary.issue.tone === "warning"
                  ? "rgba(245, 158, 11, 0.10)"
                  : "rgba(37, 99, 235, 0.08)",
            border:
              summary.issue.tone === "error"
                ? "1px solid rgba(220, 38, 38, 0.18)"
                : summary.issue.tone === "warning"
                  ? "1px solid rgba(245, 158, 11, 0.2)"
                  : "1px solid rgba(37, 99, 235, 0.16)"
          }}
        >
          <div style={{ fontSize: 12, color: "#6c7a89", marginBottom: 8 }}>异常 / 修复提示</div>
          <strong style={{ fontSize: 16, color: "#1f2937" }}>{summary.issue.title}</strong>
          <p style={{ margin: "8px 0 0", color: "#314155", lineHeight: 1.7 }}>{summary.issue.message}</p>
          {summary.issue.detail ? (
            <p style={{ margin: "8px 0 0", color: "#5c6b7a", lineHeight: 1.7 }}>{summary.issue.detail}</p>
          ) : null}
        </article>
      ) : null}
      {summary.actions && summary.actions.length > 0 && onAction ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {summary.actions.map((action) => (
            <button
              key={action.key}
              type="button"
              onClick={() => onAction(action)}
              disabled={busyActionKey === action.key}
              style={{
                borderRadius: 999,
                padding: "10px 16px",
                border:
                  action.tone === "danger"
                    ? "1px solid rgba(220, 38, 38, 0.25)"
                    : action.tone === "primary"
                      ? "1px solid rgba(37, 99, 235, 0.24)"
                      : "1px solid rgba(20,40,60,0.14)",
                background:
                  action.tone === "danger"
                    ? "rgba(220, 38, 38, 0.08)"
                    : action.tone === "primary"
                      ? "rgba(37, 99, 235, 0.1)"
                      : "rgba(255,255,255,0.9)",
                color:
                  action.tone === "danger"
                    ? "#b91c1c"
                    : action.tone === "primary"
                      ? "#1d4ed8"
                      : "#1f2937",
                cursor: busyActionKey === action.key ? "default" : "pointer"
              }}
            >
              {busyActionKey === action.key ? "处理中..." : action.label}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
