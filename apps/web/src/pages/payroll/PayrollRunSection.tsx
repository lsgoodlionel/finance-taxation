import React, { type ReactNode } from "react";

type PayrollRunSectionProps = {
  summary?: ReactNode;
  controls: ReactNode;
  history?: ReactNode;
  detail?: ReactNode;
  empty?: ReactNode;
};

export function PayrollRunSection({
  summary,
  controls,
  history,
  detail,
  empty
}: PayrollRunSectionProps) {
  return (
    <section className="v3-section-shell" data-tone="accent">
      <div className="v3-section-heading">
        <span className="v3-section-kicker">工资运行</span>
        <h2 className="v3-section-title">先看工作流摘要，再计算工资、同步事项和进入下游复核。</h2>
        <p className="v3-section-description">这里承接工资期间、工作流摘要、税务复核、凭证建议和风险联动，是工资闭环的主工作区。</p>
      </div>
      {summary}
      {controls}
      {history}
      {detail}
      {empty}
    </section>
  );
}
