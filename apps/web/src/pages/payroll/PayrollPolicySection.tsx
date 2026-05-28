import React, { type ReactNode } from "react";

type PayrollPolicySectionProps = {
  content: ReactNode;
};

export function PayrollPolicySection({ content }: PayrollPolicySectionProps) {
  return (
    <section className="v3-section-shell" data-tone="muted">
      <div className="v3-section-heading">
        <span className="v3-section-kicker">工资参数</span>
        <h2 className="v3-section-title">统一维护社保、公积金和个税参数口径。</h2>
        <p className="v3-section-description">这里只处理工资计算依赖的制度参数，不直接负责工资期间的执行或风险闭环。</p>
      </div>
      {content}
    </section>
  );
}
