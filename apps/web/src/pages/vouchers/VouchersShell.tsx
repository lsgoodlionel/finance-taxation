import React, { type ReactNode } from "react";

/**
 * 凭证中心的首屏骨架（V10 车道 G2）。
 *
 * 改造前这一页平铺 7 块：页头、事项筛选提示、WorkflowRuntimePanel、
 * WorkflowRuntimeCard（与前一块语义重复）、喂假数据的阶段流程图、凭证列表卡、
 * 凭证详情卡。用户打开先看到两块运维面板，真正要动手的列表被挤到第三屏。
 *
 * 改造后固定四段（筛选提示按需出现，最多五段）：
 *   页头 → [事项筛选提示] → 这张凭证办到哪了 → 工作区（列表 + 详情）→ 运行态（次要）
 *
 * 把顺序钉在外壳里而不是散在页面 JSX 中，是为了让「首屏最多几块、什么顺序」
 * 成为可单测的约束（见 vouchers-shell.test.tsx），而不是靠人肉复查。
 */
interface VouchersShellProps {
  header: ReactNode;
  /** 从别的页面带筛选条件跳进来时的提示，平时不占位。 */
  notice?: ReactNode;
  /** 当前这张凭证的流程与下一步动作。 */
  flow: ReactNode;
  /** 主工作区：凭证列表 + 详情。 */
  children: ReactNode;
  /** 次要信息：运行态与授权态，正常时自己折起来。 */
  aside?: ReactNode;
}

export function VouchersShell({ header, notice, flow, children, aside }: VouchersShellProps) {
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <section className="v3-hero-shell">{header}</section>
      {notice ? <section className="v3-section-shell" data-tone="muted">{notice}</section> : null}
      <section className="v3-section-shell">{flow}</section>
      <section className="v3-section-shell">{children}</section>
      {aside ? <aside aria-label="凭证的运行与授权状态">{aside}</aside> : null}
    </div>
  );
}
