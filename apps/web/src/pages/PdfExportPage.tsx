import { useEffect, useState } from "react";
import {
  getStoredToken,
  getPayrollPeriods,
  listReportSnapshots,
  listVouchers,
  login,
  refreshSession
} from "../lib/api";
import type { PayrollPeriodSummary, ReportSnapshot, Voucher } from "@finance-taxation/domain-model";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:3100";

function openPdf(path: string) {
  const token = getStoredToken();
  const url = `${API_BASE_URL}${path}&_token=${encodeURIComponent(token ?? "")}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function openPdfNoToken(path: string) {
  const token = getStoredToken();
  const sep = path.includes("?") ? "&" : "?";
  window.open(`${API_BASE_URL}${path}${sep}_token=${encodeURIComponent(token ?? "")}`, "_blank", "noopener,noreferrer");
}

function panelStyle() {
  return {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)",
    padding: "24px"
  } as const;
}

function cellStyle() {
  return { borderBottom: "1px solid rgba(20,40,60,0.08)", padding: "10px 8px", textAlign: "left" as const };
}

function btnExport(onClick: () => void, label = "导出 PDF") {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: "12px", padding: "4px 12px", borderRadius: "6px",
        border: "1px solid rgba(20,40,60,0.15)", color: "#1e2a37",
        background: "none", cursor: "pointer", whiteSpace: "nowrap" as const
      }}
    >
      {label}
    </button>
  );
}

const REPORT_TYPE_LABELS: Record<string, string> = {
  balance_sheet: "资产负债表",
  profit_statement: "利润表",
  cash_flow: "现金流量表"
};

export function PdfExportPage() {
  const [periods, setPeriods] = useState<PayrollPeriodSummary[]>([]);
  const [snapshots, setSnapshots] = useState<ReportSnapshot[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [message, setMessage] = useState("正在加载导出列表...");
  const [activeTab, setActiveTab] = useState<"payroll" | "reports" | "vouchers">("payroll");

  useEffect(() => {
    async function bootstrap() {
      try {
        await login("chairman", "123456");
        await refreshSession();
        const [perRes, snapRes, vcRes] = await Promise.all([
          getPayrollPeriods(),
          listReportSnapshots(),
          listVouchers()
        ]);
        setPeriods(perRes.items);
        setSnapshots(snapRes.items);
        setVouchers(vcRes.items.slice(0, 50));
        setMessage("选择下方内容可在新窗口打开打印版，点击「打印 / 导出 PDF」按钮完成导出。");
      } catch {
        setMessage("加载失败，请检查后端连接。");
      }
    }
    bootstrap();
  }, []);

  const tabStyle = (t: typeof activeTab) => ({
    padding: "8px 20px", borderRadius: "8px", border: "none",
    cursor: "pointer", fontSize: "14px",
    background: activeTab === t ? "#1e2a37" : "rgba(255,255,255,0.72)",
    color: activeTab === t ? "#fff" : "#1e2a37"
  } as const);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: "22px" }}>PDF 导出中心</h2>
          <div style={{ color: "#6c7a89", fontSize: "13px" }}>{message}</div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button style={tabStyle("payroll")} onClick={() => setActiveTab("payroll")}>工资导出</button>
          <button style={tabStyle("reports")} onClick={() => setActiveTab("reports")}>报表导出</button>
          <button style={tabStyle("vouchers")} onClick={() => setActiveTab("vouchers")}>凭证导出</button>
        </div>
      </div>

      <div style={{ ...panelStyle(), background: "rgba(232,244,239,0.6)", border: "1px solid rgba(26,127,90,0.15)", fontSize: "13px", color: "#1a7f5a" }}>
        💡 打开导出链接后，在浏览器中按 <strong>Ctrl+P</strong>（Mac: <strong>⌘+P</strong>），选择「另存为 PDF」即可保存 PDF 文件。
      </div>

      {/* ── 工资导出 ── */}
      {activeTab === "payroll" && (
        <div style={panelStyle()}>
          <h3 style={{ margin: "0 0 16px", fontSize: "15px" }}>工资汇总表 &amp; 工资条</h3>
          {periods.length === 0 ? (
            <div style={{ color: "#aab5c0", textAlign: "center", padding: "32px" }}>暂无工资数据</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ color: "#6c7a89" }}>
                  {["工资期间", "人数", "实发合计", "状态", "操作"].map((h) => (
                    <th key={h} style={{ ...cellStyle(), fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => (
                  <tr key={p.period}>
                    <td style={cellStyle()}>{p.period}</td>
                    <td style={cellStyle()}>{p.headcount} 人</td>
                    <td style={cellStyle()}>
                      ¥ {p.totalNetPay.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}
                    </td>
                    <td style={cellStyle()}>
                      <span style={{ fontSize: "12px", color: p.status === "confirmed" ? "#1a7f5a" : "#8a9bb0" }}>
                        {p.status === "confirmed" ? "已确认" : p.status === "draft" ? "草稿" : "部分确认"}
                      </span>
                    </td>
                    <td style={{ ...cellStyle(), display: "flex", gap: "6px" }}>
                      {btnExport(() => openPdf(`/api/pdf/payroll?period=${p.period}`), "工资汇总")}
                      {btnExport(() => openPdf(`/api/pdf/payroll-slip?period=${p.period}`), "全员工资条")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── 报表导出 ── */}
      {activeTab === "reports" && (
        <div style={panelStyle()}>
          <h3 style={{ margin: "0 0 16px", fontSize: "15px" }}>财务报表快照导出</h3>
          {snapshots.length === 0 ? (
            <div style={{ color: "#aab5c0", textAlign: "center", padding: "32px" }}>暂无报表快照，请先在「财务报表」页生成快照</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ color: "#6c7a89" }}>
                  {["报表类型", "期间", "快照日期", "操作"].map((h) => (
                    <th key={h} style={{ ...cellStyle(), fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => (
                  <tr key={s.id}>
                    <td style={cellStyle()}>{REPORT_TYPE_LABELS[s.reportType] ?? s.reportType}</td>
                    <td style={cellStyle()}>{s.periodLabel}</td>
                    <td style={cellStyle()}>{s.snapshotDate}</td>
                    <td style={cellStyle()}>
                      {btnExport(() => openPdfNoToken(`/api/pdf/report?snapshotId=${s.id}`))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── 凭证导出 ── */}
      {activeTab === "vouchers" && (
        <div style={panelStyle()}>
          <h3 style={{ margin: "0 0 16px", fontSize: "15px" }}>凭证导出（最近 50 条）</h3>
          {vouchers.length === 0 ? (
            <div style={{ color: "#aab5c0", textAlign: "center", padding: "32px" }}>暂无凭证数据</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ color: "#6c7a89" }}>
                  {["凭证编号", "类型", "摘要", "状态", "操作"].map((h) => (
                    <th key={h} style={{ ...cellStyle(), fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vouchers.map((v) => (
                  <tr key={v.id}>
                    <td style={cellStyle()}>{v.id.slice(-8).toUpperCase()}</td>
                    <td style={cellStyle()}>{v.voucherType}</td>
                    <td style={cellStyle()}>{v.summary}</td>
                    <td style={cellStyle()}>{v.status}</td>
                    <td style={cellStyle()}>
                      {btnExport(() => openPdfNoToken(`/api/pdf/voucher/${v.id}`))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
