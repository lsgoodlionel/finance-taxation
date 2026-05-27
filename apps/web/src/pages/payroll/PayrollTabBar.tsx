import React from "react";

export type PayrollTab = "employees" | "payroll" | "policy";

type PayrollTabBarProps = {
  activeTab: PayrollTab;
  onChange: (tab: PayrollTab) => void;
};

const TABS: { key: PayrollTab; label: string }[] = [
  { key: "employees", label: "员工管理" },
  { key: "payroll", label: "工资计算" },
  { key: "policy", label: "参数设置" }
];

export function PayrollTabBar({ activeTab, onChange }: PayrollTabBarProps) {
  return (
    <div className="v3-tab-bar">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          className="v3-tab-bar__button"
          data-active={activeTab === tab.key}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
