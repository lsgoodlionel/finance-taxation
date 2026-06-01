import type { Contract, ContractWithEventCount } from "@finance-taxation/domain-model";

function cellStyle() {
  return {
    borderBottom: "1px solid rgba(20,40,60,0.08)",
    padding: "10px 8px",
    textAlign: "left" as const,
    verticalAlign: "top" as const
  };
}

interface ContractsTableProps {
  contracts: ContractWithEventCount[];
  creatingEventContractId: string | null;
  contractTypeLabels: Record<string, string>;
  statusLabels: Record<string, string>;
  statusColor: Record<string, string>;
  onOpenDetail: (contractId: string) => void;
  onCreateEvent: (contract: Contract) => void;
  onClose: (contract: Contract, status: "fulfilled" | "terminated") => void;
}

export function ContractsTable({
  contracts,
  creatingEventContractId,
  contractTypeLabels,
  statusLabels,
  statusColor,
  onOpenDetail,
  onCreateEvent,
  onClose
}: ContractsTableProps) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", minWidth: "860px", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr style={{ color: "#6c7a89" }}>
            {["合同标题", "类型", "交易方", "金额", "状态", "关联事项", "操作"].map((header) => (
              <th key={header} style={{ ...cellStyle(), fontWeight: 500, whiteSpace: "nowrap" }}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {contracts.length === 0 ? (
            <tr>
              <td colSpan={7} style={{ ...cellStyle(), color: "#aab5c0", textAlign: "center", padding: "32px" }}>
                暂无合同数据，请点击"新建合同"添加
              </td>
            </tr>
          ) : (
            contracts.map((contract) => (
              <tr key={contract.id}>
                <td style={{ ...cellStyle(), minWidth: "180px" }}>
                  <button
                    onClick={() => onOpenDetail(contract.id)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#2563eb", fontSize: "13px", padding: 0, textAlign: "left" }}
                  >
                    {contract.title}
                  </button>
                  <div style={{ color: "#8a9bb0", fontSize: "11px", marginTop: "4px" }}>{contract.contractNo}</div>
                </td>
                <td style={{ ...cellStyle(), minWidth: "96px", whiteSpace: "nowrap" }}>
                  {contractTypeLabels[contract.contractType] ?? contract.contractType}
                </td>
                <td style={{ ...cellStyle(), minWidth: "140px" }}>{contract.counterpartyName}</td>
                <td style={{ ...cellStyle(), minWidth: "112px", whiteSpace: "nowrap" }}>
                  {contract.amount.toLocaleString("zh-CN", { style: "currency", currency: contract.currency || "CNY" })}
                </td>
                <td style={{ ...cellStyle(), minWidth: "92px", whiteSpace: "nowrap" }}>
                  <span
                    style={{
                      background: `${statusColor[contract.status]}22`,
                      color: statusColor[contract.status],
                      borderRadius: "999px",
                      padding: "2px 10px",
                      fontSize: "12px"
                    }}
                  >
                    {statusLabels[contract.status] ?? contract.status}
                  </span>
                </td>
                <td style={{ ...cellStyle(), textAlign: "center", minWidth: "88px" }}>{contract.relatedEventCount}</td>
                <td style={{ ...cellStyle(), minWidth: "210px" }}>
                  <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                    <button
                      onClick={() => onCreateEvent(contract)}
                      disabled={creatingEventContractId === contract.id}
                      style={{
                        fontSize: "12px",
                        padding: "3px 10px",
                        borderRadius: "6px",
                        border: "1px solid #2563eb",
                        color: "#2563eb",
                        background: "none",
                        cursor: "pointer",
                        opacity: creatingEventContractId === contract.id ? 0.6 : 1,
                        whiteSpace: "nowrap"
                      }}
                    >
                      {creatingEventContractId === contract.id ? "生成中..." : "新增事项"}
                    </button>
                    {contract.status === "active" ? (
                      <>
                        <button
                          onClick={() => onClose(contract, "fulfilled")}
                          style={{
                            fontSize: "12px",
                            padding: "3px 10px",
                            borderRadius: "6px",
                            border: "1px solid #1a7f5a",
                            color: "#1a7f5a",
                            background: "none",
                            cursor: "pointer",
                            whiteSpace: "nowrap"
                          }}
                        >
                          已履行
                        </button>
                        <button
                          onClick={() => onClose(contract, "terminated")}
                          style={{
                            fontSize: "12px",
                            padding: "3px 10px",
                            borderRadius: "6px",
                            border: "1px solid #c0392b",
                            color: "#c0392b",
                            background: "none",
                            cursor: "pointer",
                            whiteSpace: "nowrap"
                          }}
                        >
                          终止
                        </button>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
