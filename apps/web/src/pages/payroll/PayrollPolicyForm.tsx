import React from "react";

type PayrollPolicyFormProps = {
  editing: boolean;
  form: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  formatAmount: (value: number) => string;
  formatPercent: (value: number) => string;
};

const POLICY_FIELDS = [
  { label: "社保基数下限（元）", key: "socialSecurityBaseMin" },
  { label: "社保基数上限（元）", key: "socialSecurityBaseMax" },
  { label: "养老保险 个人费率", key: "pensionEmployeeRate" },
  { label: "养老保险 单位费率", key: "pensionEmployerRate" },
  { label: "医疗保险 个人费率", key: "medicalEmployeeRate" },
  { label: "医疗保险 单位费率", key: "medicalEmployerRate" },
  { label: "失业保险 个人费率", key: "unemploymentEmployeeRate" },
  { label: "失业保险 单位费率", key: "unemploymentEmployerRate" },
  { label: "住房公积金 个人费率", key: "housingFundEmployeeRate" },
  { label: "住房公积金 单位费率", key: "housingFundEmployerRate" },
  { label: "个税起征点（元）", key: "iitThreshold" }
] as const;

export function PayrollPolicyForm({
  editing,
  form,
  onChange,
  onStartEdit,
  onSave,
  onCancel,
  formatAmount,
  formatPercent
}: PayrollPolicyFormProps) {
  return (
    <div style={{ background: "rgba(255,255,255,0.82)", borderRadius: "24px", border: "1px solid rgba(20,40,60,0.08)", padding: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h3 style={{ margin: 0, fontSize: "16px" }}>社保/公积金/个税参数</h3>
        {!editing ? (
          <button style={{ background: "#1e2a37", color: "#fff", border: "none", borderRadius: "8px", padding: "8px 18px", cursor: "pointer", fontSize: "13px" }} onClick={onStartEdit}>
            编辑参数
          </button>
        ) : (
          <div style={{ display: "flex", gap: "8px" }}>
            <button style={{ background: "#1e2a37", color: "#fff", border: "none", borderRadius: "8px", padding: "8px 18px", cursor: "pointer", fontSize: "13px" }} onClick={onSave}>
              保存
            </button>
            <button style={{ background: "#eef0f3", color: "#1e2a37", border: "none", borderRadius: "8px", padding: "8px 14px", cursor: "pointer", fontSize: "13px" }} onClick={onCancel}>
              取消
            </button>
          </div>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 40px" }}>
        {POLICY_FIELDS.map(({ label, key }) => {
          const isRate = key.endsWith("Rate");
          const raw = Number(form[key] ?? 0);
          const display = editing ? form[key] : (isRate ? formatPercent(raw) : formatAmount(raw));
          return (
            <div key={key} style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px" }}>
              <span style={{ color: "#6c7a89" }}>{label}</span>
              {editing ? (
                <input
                  type="number"
                  value={form[key]}
                  step={isRate ? "0.001" : "100"}
                  onChange={(event) => onChange({ ...form, [key]: event.target.value })}
                  style={{ padding: "7px", borderRadius: "6px", border: "1px solid #dce3ea", fontSize: "13px", width: "120px" }}
                />
              ) : (
                <span style={{ fontWeight: 500 }}>{display}</span>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: "20px", padding: "12px 16px", background: "rgba(30,42,55,0.04)", borderRadius: "12px", fontSize: "12px", color: "#6c7a89" }}>
        <strong>个税计算说明：</strong>应纳税所得额 = 应发工资 − 个人社保 − 个人公积金 − 起征点，适用七级超额累进税率（3%～45%）。
      </div>
    </div>
  );
}
