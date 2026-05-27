import React from "react";

type EmployeeFormValue = {
  name: string;
  idCard: string;
  position: string;
  hireDate: string;
  baseSalary: string;
  notes: string;
};

type PayrollEmployeeFormProps = {
  editingName?: string;
  form: EmployeeFormValue;
  onChange: (next: EmployeeFormValue) => void;
  onSubmit: () => void;
  onCancel: () => void;
  primaryLabel: string;
};

const FIELD_CONFIG = [
  { label: "姓名*", key: "name", type: "text" },
  { label: "身份证号", key: "idCard", type: "text" },
  { label: "职位", key: "position", type: "text" },
  { label: "入职日期", key: "hireDate", type: "date" },
  { label: "基本工资（元）*", key: "baseSalary", type: "number" }
] as const;

export function PayrollEmployeeForm({
  editingName,
  form,
  onChange,
  onSubmit,
  onCancel,
  primaryLabel
}: PayrollEmployeeFormProps) {
  return (
    <div style={{ background: "rgba(255,255,255,0.82)", borderRadius: "24px", border: "1px solid rgba(20,40,60,0.08)", padding: "24px" }}>
      <h3 style={{ margin: "0 0 16px", fontSize: "16px" }}>
        {editingName ? `编辑员工：${editingName}` : "添加员工"}
      </h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        {FIELD_CONFIG.map(({ label, key, type }) => (
          <label key={key} style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px" }}>
            <span style={{ color: "#6c7a89" }}>{label}</span>
            <input
              type={type}
              value={form[key]}
              onChange={(event) => onChange({ ...form, [key]: event.target.value })}
              style={{ padding: "8px", borderRadius: "6px", border: "1px solid #dce3ea", fontSize: "13px" }}
            />
          </label>
        ))}
        <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", gridColumn: "1 / -1" }}>
          <span style={{ color: "#6c7a89" }}>备注</span>
          <input
            type="text"
            value={form.notes}
            onChange={(event) => onChange({ ...form, notes: event.target.value })}
            style={{ padding: "8px", borderRadius: "6px", border: "1px solid #dce3ea", fontSize: "13px" }}
          />
        </label>
      </div>
      <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
        <button style={{ background: "#1e2a37", color: "#fff", border: "none", borderRadius: "8px", padding: "8px 18px", cursor: "pointer", fontSize: "13px" }} onClick={onSubmit}>
          {primaryLabel}
        </button>
        <button style={{ background: "#eef0f3", color: "#1e2a37", border: "none", borderRadius: "8px", padding: "8px 14px", cursor: "pointer", fontSize: "13px" }} onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  );
}
