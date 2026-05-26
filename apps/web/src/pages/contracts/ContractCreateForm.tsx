interface ContractFormValue {
  contractType: string;
  title: string;
  counterpartyName: string;
  counterpartyType: string;
  amount: string;
  currency: string;
  signedDate: string;
  startDate: string;
  endDate: string;
  notes: string;
}

interface ContractCreateFormProps {
  value: ContractFormValue;
  contractTypeOptions: [string, string][];
  counterpartyTypeOptions: [string, string][];
  onChange: (value: ContractFormValue) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

interface ContractCreateField {
  label: string;
  key: keyof ContractFormValue;
  type: "select" | "text" | "number" | "date";
  options?: [string, string][];
}

export function ContractCreateForm({
  value,
  contractTypeOptions,
  counterpartyTypeOptions,
  onChange,
  onSubmit,
  onCancel
}: ContractCreateFormProps) {
  const fields: ContractCreateField[] = [
    { label: "合同类型", key: "contractType", type: "select", options: contractTypeOptions },
    { label: "合同标题*", key: "title", type: "text" },
    { label: "交易方名称*", key: "counterpartyName", type: "text" },
    { label: "交易方类型", key: "counterpartyType", type: "select", options: counterpartyTypeOptions },
    { label: "合同金额", key: "amount", type: "number" },
    { label: "币种", key: "currency", type: "text" },
    { label: "签订日期", key: "signedDate", type: "date" },
    { label: "起始日期", key: "startDate", type: "date" },
    { label: "到期日期", key: "endDate", type: "date" }
  ] as const;

  return (
    <>
      <h3 style={{ margin: "0 0 16px", fontSize: "16px" }}>新建合同</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        {fields.map(({ label, key, type, options }) => (
          <label key={key} style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px" }}>
            <span style={{ color: "#6c7a89" }}>{label}</span>
            {type === "select" ? (
              <select
                value={value[key]}
                onChange={(event) => onChange({ ...value, [key]: event.target.value })}
                style={{ padding: "8px", borderRadius: "6px", border: "1px solid #dce3ea", fontSize: "13px" }}
              >
                {options?.map(([optionValue, optionLabel]) => (
                  <option key={optionValue} value={optionValue}>
                    {optionLabel}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={type}
                value={value[key]}
                onChange={(event) => onChange({ ...value, [key]: event.target.value })}
                style={{ padding: "8px", borderRadius: "6px", border: "1px solid #dce3ea", fontSize: "13px" }}
              />
            )}
          </label>
        ))}
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            fontSize: "13px",
            gridColumn: "1 / -1"
          }}
        >
          <span style={{ color: "#6c7a89" }}>备注</span>
          <textarea
            rows={2}
            value={value.notes}
            onChange={(event) => onChange({ ...value, notes: event.target.value })}
            style={{
              padding: "8px",
              borderRadius: "6px",
              border: "1px solid #dce3ea",
              fontSize: "13px",
              resize: "vertical"
            }}
          />
        </label>
      </div>
      <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
        <button
          onClick={onSubmit}
          style={{
            background: "#1e2a37",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            padding: "8px 20px",
            cursor: "pointer"
          }}
        >
          确认创建
        </button>
        <button
          onClick={onCancel}
          style={{
            background: "#eef0f3",
            color: "#1e2a37",
            border: "none",
            borderRadius: "6px",
            padding: "8px 16px",
            cursor: "pointer"
          }}
        >
          取消
        </button>
      </div>
    </>
  );
}
