import React, { type ReactNode } from "react";

type PayrollEmployeesSectionProps = {
  toolbar: ReactNode;
  form?: ReactNode;
  list: ReactNode;
};

export function PayrollEmployeesSection({ toolbar, form, list }: PayrollEmployeesSectionProps) {
  return (
    <section className="v3-section-shell" data-tone="muted">
      <div className="v3-section-heading">
        <span className="v3-section-kicker">员工台账</span>
        <h2 className="v3-section-title">先管理员工与基础薪资，再进入工资运行区。</h2>
        <p className="v3-section-description">这里负责员工主数据和工资计算输入条件，不处理税务或凭证动作。</p>
      </div>
      {toolbar}
      {form}
      {list}
    </section>
  );
}
