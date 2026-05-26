interface ContractMetadataField {
  label: string;
  value: string;
}

interface ContractMetadataGridProps {
  fields: ContractMetadataField[];
}

export function ContractMetadataGrid({ fields }: ContractMetadataGridProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: "12px 24px",
        fontSize: "13px",
        marginBottom: "20px"
      }}
    >
      {fields.map((field) => (
        <div key={field.label}>
          <div style={{ color: "#6c7a89", marginBottom: "2px" }}>{field.label}</div>
          <div>{field.value}</div>
        </div>
      ))}
    </div>
  );
}
