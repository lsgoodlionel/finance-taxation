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
    <div style={{ display: "flex", gap: "8px" }}>
      {TABS.map((tab) => (
        <button
          key={tab.key}
          style={{
            padding: "8px 20px",
            borderRadius: "8px",
            border: "none",
            cursor: "pointer",
            fontSize: "14px",
            background: activeTab === tab.key ? "#1e2a37" : "rgba(255,255,255,0.72)",
            color: activeTab === tab.key ? "#fff" : "#1e2a37"
          }}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
