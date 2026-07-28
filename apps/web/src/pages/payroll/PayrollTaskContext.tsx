import React, { type ReactNode } from "react";

/**
 * 当前这件事的上下文：一句状态文案 + 运行与授权状态。
 *
 * 为什么合成一块：改造前状态横幅挂在页头里、运行态面板单独占一整块，两块都是
 * 「刚才发生了什么 / 后台现在什么状况」，却把工作区上下夹住。合成一个 aside 之后
 * 首屏平级区块少一块，也和 /ledger、/knowledge 的「工作区在前、上下文在后」一致。
 *
 * 运行态默认收起：一切正常时它只是一行字；只有确有失败或待授权（needsRuntimeAttention）
 * 时才展开占视线——同 /tax、/vouchers 的口径。
 */
export interface PayrollTaskContextProps {
  /** 这件事此刻的状态文案。 */
  message: ReactNode;
  /** 运行态与授权态面板。 */
  runtime: ReactNode;
  /** 运行态是否确有异常；无异常时收起。 */
  runtimeAttention: boolean;
}

const ASIDE_STYLE: React.CSSProperties = { display: "grid", gap: 10 };

const STATUS_LINE_STYLE: React.CSSProperties = { fontSize: "13px" };

const DETAILS_SUMMARY_STYLE: React.CSSProperties = {
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  color: "#4d5d6c"
};

export function PayrollTaskContext({ message, runtime, runtimeAttention }: PayrollTaskContextProps) {
  return (
    <aside aria-label="这件事的相关信息" style={ASIDE_STYLE}>
      <div className="v3-banner" data-tone="info" style={STATUS_LINE_STYLE}>{message}</div>
      {runtimeAttention ? runtime : (
        <details className="v3-section-shell" data-tone="muted" style={{ padding: "12px 16px" }}>
          <summary style={DETAILS_SUMMARY_STYLE}>运行与授权状态（当前无异常）</summary>
          <div style={{ marginTop: "12px" }}>{runtime}</div>
        </details>
      )}
    </aside>
  );
}
