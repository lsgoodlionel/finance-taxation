import { useEffect, useState } from "react";
import type { Contract, ContractWithEventCount } from "@finance-taxation/domain-model";
import {
  closeContract,
  createContract,
  getContractDetail,
  listContracts,
  login,
  refreshSession
} from "../lib/api";

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  sales: "销售合同",
  procurement: "采购合同",
  lease: "租赁合同",
  service: "服务合同",
  other: "其他"
};

const STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  active: "执行中",
  fulfilled: "已履行",
  terminated: "已终止",
  expired: "已到期"
};

const STATUS_COLOR: Record<string, string> = {
  draft: "#8a9bb0",
  active: "#1a7f5a",
  fulfilled: "#4a7fc4",
  terminated: "#c0392b",
  expired: "#b0890a"
};

function panelStyle() {
  return {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)",
    padding: "24px"
  } as const;
}

function cellStyle() {
  return {
    borderBottom: "1px solid rgba(20,40,60,0.08)",
    padding: "10px 8px",
    textAlign: "left" as const,
    verticalAlign: "top" as const
  };
}

interface ContractDetailView {
  contract: Contract;
  relatedEvents: { id: string; title: string; status: string; createdAt: string }[];
}

export function ContractsPage() {
  const [contracts, setContracts] = useState<ContractWithEventCount[]>([]);
  const [detail, setDetail] = useState<ContractDetailView | null>(null);
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("正在加载合同数据...");

  const [form, setForm] = useState({
    contractType: "sales",
    title: "",
    counterpartyName: "",
    counterpartyType: "external",
    amount: "",
    currency: "CNY",
    signedDate: "",
    startDate: "",
    endDate: "",
    notes: ""
  });

  useEffect(() => {
    async function bootstrap() {
      try {
        await login("chairman", "123456");
        await refreshSession();
        await loadContracts();
      } catch {
        setMessage("加载失败，请检查后端连接。");
      }
    }
    bootstrap();
  }, []);

  async function loadContracts() {
    const filters = {
      contractType: filterType || undefined,
      status: filterStatus || undefined
    };
    const res = await listContracts(filters);
    setContracts(res.items);
    setMessage(`已加载 ${res.total} 条合同。`);
  }

  async function handleCreate() {
    if (!form.title || !form.counterpartyName) {
      setMessage("合同标题和交易方名称不能为空。");
      return;
    }
    await createContract({
      contractType: form.contractType,
      title: form.title,
      counterpartyName: form.counterpartyName,
      counterpartyType: form.counterpartyType,
      amount: Number(form.amount) || 0,
      currency: form.currency,
      signedDate: form.signedDate || undefined,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      notes: form.notes
    });
    setShowForm(false);
    setForm({
      contractType: "sales", title: "", counterpartyName: "",
      counterpartyType: "external", amount: "", currency: "CNY",
      signedDate: "", startDate: "", endDate: "", notes: ""
    });
    await loadContracts();
    setMessage("合同已创建。");
  }

  async function handleClose(contractId: string, status: "fulfilled" | "terminated") {
    await closeContract(contractId, status);
    await loadContracts();
    if (detail?.contract.id === contractId) setDetail(null);
    setMessage(`合同已标记为${STATUS_LABELS[status]}。`);
  }

  async function handleDetail(contractId: string) {
    const res = await getContractDetail(contractId);
    setDetail(res);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: "22px" }}>合同管理</h2>
          <div style={{ color: "#6c7a89", fontSize: "13px" }}>{message}</div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            background: "#1e2a37", color: "#fff", border: "none",
            borderRadius: "8px", padding: "10px 20px", cursor: "pointer", fontSize: "14px"
          }}
        >
          + 新建合同
        </button>
      </div>

      {showForm && (
        <div style={panelStyle()}>
          <h3 style={{ margin: "0 0 16px", fontSize: "16px" }}>新建合同</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            {[
              { label: "合同类型", key: "contractType", type: "select",
                options: Object.entries(CONTRACT_TYPE_LABELS) },
              { label: "合同标题*", key: "title", type: "text" },
              { label: "交易方名称*", key: "counterpartyName", type: "text" },
              { label: "交易方类型", key: "counterpartyType", type: "select",
                options: [["external", "外部"], ["internal", "内部"]] },
              { label: "合同金额", key: "amount", type: "number" },
              { label: "币种", key: "currency", type: "text" },
              { label: "签订日期", key: "signedDate", type: "date" },
              { label: "起始日期", key: "startDate", type: "date" },
              { label: "到期日期", key: "endDate", type: "date" }
            ].map(({ label, key, type, options }) => (
              <label key={key} style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px" }}>
                <span style={{ color: "#6c7a89" }}>{label}</span>
                {type === "select" ? (
                  <select
                    value={form[key as keyof typeof form]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    style={{ padding: "8px", borderRadius: "6px", border: "1px solid #dce3ea", fontSize: "13px" }}
                  >
                    {options?.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                ) : (
                  <input
                    type={type}
                    value={form[key as keyof typeof form]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    style={{ padding: "8px", borderRadius: "6px", border: "1px solid #dce3ea", fontSize: "13px" }}
                  />
                )}
              </label>
            ))}
            <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", gridColumn: "1 / -1" }}>
              <span style={{ color: "#6c7a89" }}>备注</span>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                style={{ padding: "8px", borderRadius: "6px", border: "1px solid #dce3ea", fontSize: "13px", resize: "vertical" }}
              />
            </label>
          </div>
          <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
            <button
              onClick={handleCreate}
              style={{ background: "#1e2a37", color: "#fff", border: "none", borderRadius: "6px", padding: "8px 20px", cursor: "pointer" }}
            >
              确认创建
            </button>
            <button
              onClick={() => setShowForm(false)}
              style={{ background: "#eef0f3", color: "#1e2a37", border: "none", borderRadius: "6px", padding: "8px 16px", cursor: "pointer" }}
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: "12px" }}>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #dce3ea", fontSize: "13px" }}
        >
          <option value="">全部类型</option>
          {Object.entries(CONTRACT_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid #dce3ea", fontSize: "13px" }}
        >
          <option value="">全部状态</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button
          onClick={loadContracts}
          style={{ padding: "8px 16px", borderRadius: "8px", background: "#eef0f3", border: "none", cursor: "pointer", fontSize: "13px" }}
        >
          筛选
        </button>
      </div>

      <div style={panelStyle()}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr style={{ color: "#6c7a89" }}>
              {["合同标题", "类型", "交易方", "金额", "状态", "关联事项", "操作"].map((h) => (
                <th key={h} style={{ ...cellStyle(), fontWeight: 500 }}>{h}</th>
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
              contracts.map((c) => (
                <tr key={c.id}>
                  <td style={cellStyle()}>
                    <button
                      onClick={() => handleDetail(c.id)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#2563eb", fontSize: "13px", padding: 0 }}
                    >
                      {c.title}
                    </button>
                    <div style={{ color: "#8a9bb0", fontSize: "11px" }}>{c.contractNo}</div>
                  </td>
                  <td style={cellStyle()}>{CONTRACT_TYPE_LABELS[c.contractType] ?? c.contractType}</td>
                  <td style={cellStyle()}>{c.counterpartyName}</td>
                  <td style={cellStyle()}>
                    {c.amount.toLocaleString("zh-CN", { style: "currency", currency: c.currency || "CNY" })}
                  </td>
                  <td style={cellStyle()}>
                    <span style={{
                      background: `${STATUS_COLOR[c.status]}22`,
                      color: STATUS_COLOR[c.status],
                      borderRadius: "999px", padding: "2px 10px", fontSize: "12px"
                    }}>
                      {STATUS_LABELS[c.status] ?? c.status}
                    </span>
                  </td>
                  <td style={{ ...cellStyle(), textAlign: "center" as const }}>{c.relatedEventCount}</td>
                  <td style={cellStyle()}>
                    {c.status === "active" && (
                      <div style={{ display: "flex", gap: "6px" }}>
                        <button
                          onClick={() => handleClose(c.id, "fulfilled")}
                          style={{ fontSize: "12px", padding: "3px 10px", borderRadius: "6px", border: "1px solid #1a7f5a", color: "#1a7f5a", background: "none", cursor: "pointer" }}
                        >
                          已履行
                        </button>
                        <button
                          onClick={() => handleClose(c.id, "terminated")}
                          style={{ fontSize: "12px", padding: "3px 10px", borderRadius: "6px", border: "1px solid #c0392b", color: "#c0392b", background: "none", cursor: "pointer" }}
                        >
                          终止
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {detail && (
        <div style={panelStyle()}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: "16px" }}>{detail.contract.title}</h3>
            <button
              onClick={() => setDetail(null)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#6c7a89", fontSize: "18px" }}
            >
              ×
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px 24px", fontSize: "13px", marginBottom: "20px" }}>
            {[
              ["合同编号", detail.contract.contractNo],
              ["类型", CONTRACT_TYPE_LABELS[detail.contract.contractType]],
              ["状态", STATUS_LABELS[detail.contract.status]],
              ["交易方", detail.contract.counterpartyName],
              ["金额", `${detail.contract.amount.toLocaleString()} ${detail.contract.currency}`],
              ["签订日期", detail.contract.signedDate ?? "—"],
              ["起始日期", detail.contract.startDate ?? "—"],
              ["到期日期", detail.contract.endDate ?? "—"],
              ["备注", detail.contract.notes || "—"]
            ].map(([k, v]) => (
              <div key={k}>
                <div style={{ color: "#6c7a89", marginBottom: "2px" }}>{k}</div>
                <div>{v}</div>
              </div>
            ))}
          </div>
          {detail.relatedEvents.length > 0 && (
            <>
              <h4 style={{ margin: "0 0 8px", fontSize: "14px" }}>关联经营事项（{detail.relatedEvents.length}）</h4>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                <thead>
                  <tr style={{ color: "#6c7a89" }}>
                    {["事项名称", "状态", "创建时间"].map((h) => (
                      <th key={h} style={{ ...cellStyle(), fontWeight: 400 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.relatedEvents.map((e) => (
                    <tr key={e.id}>
                      <td style={cellStyle()}>{e.title}</td>
                      <td style={cellStyle()}>{e.status}</td>
                      <td style={cellStyle()}>{e.createdAt ? new Date(e.createdAt).toLocaleDateString("zh-CN") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}
