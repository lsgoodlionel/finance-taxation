import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type {
  BalanceSheetReport,
  CashFlowReport,
  ProfitStatementReport,
  ReportDiffResult,
  ReportSnapshot
} from "@finance-taxation/domain-model";
import {
  createReportSnapshot,
  getBalanceSheetReport,
  getCashFlowReport,
  getChairmanReportSummary,
  getClosingBundleHtml,
  getPrintableReportHtml,
  getReportDiff,
  getProfitStatementReport,
  listReportSnapshots
} from "../lib/api";
import { buildResultPageSubtitle } from "../lib/entry-guidance";

const REPORT_TYPE_LABELS: Record<string, string> = {
  balance_sheet: "资产负债表",
  profit_statement: "利润表",
  cash_flow: "现金流量表"
};

function snapshotLabel(snap: ReportSnapshot): string {
  const type = REPORT_TYPE_LABELS[snap.reportType] ?? snap.reportType;
  return `${snap.periodLabel} ${type}`;
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
  return {
    borderBottom: "1px solid rgba(20,40,60,0.08)",
    padding: "10px 8px",
    textAlign: "left" as const,
    verticalAlign: "top" as const
  };
}

export function ReportsPage() {
  const navigate = useNavigate();
  const [periodType, setPeriodType] = useState<"month" | "quarter" | "year">("month");
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(5);
  const [quarter, setQuarter] = useState(2);
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheetReport | null>(null);
  const [profitStatement, setProfitStatement] = useState<ProfitStatementReport | null>(null);
  const [cashFlow, setCashFlow] = useState<CashFlowReport | null>(null);
  const [snapshots, setSnapshots] = useState<ReportSnapshot[]>([]);
  const [fromSnapshotId, setFromSnapshotId] = useState("");
  const [toSnapshotId, setToSnapshotId] = useState("");
  const [diff, setDiff] = useState<ReportDiffResult | null>(null);
  const [chairmanSummary, setChairmanSummary] = useState<{
    headline: string;
    highlights: string[];
    risks: string[];
  } | null>(null);
  const [message, setMessage] = useState("正在准备财务报表。");

  useEffect(() => {
    async function bootstrap() {
      try {
        await loadReports();
      } catch (error) {
        setMessage((error as Error).message);
      }
    }
    void bootstrap();
  }, []);

  async function loadReports() {
    const request = { periodType, year, month, quarter };
    const [bs, ps, cf] = await Promise.all([
      getBalanceSheetReport(request),
      getProfitStatementReport(request),
      getCashFlowReport(request)
    ]);
    const snapshotsPayload = await listReportSnapshots();
    setBalanceSheet(bs);
    setProfitStatement(ps);
    setCashFlow(cf);
    setSnapshots(snapshotsPayload.items);
    setMessage(`已更新 ${bs.periodLabel} 财务三表。`);
  }

  return (
    <section style={{ display: "grid", gap: "20px" }}>
      <article style={panelStyle()}>
        <h2 style={{ marginTop: 0, marginBottom: "4px" }}>财务报表中心</h2>
        <div style={{ color: "#6c7a89", fontSize: "13px", marginBottom: "10px" }}>
          {buildResultPageSubtitle("财务报表")}
        </div>
        <p>{message}</p>
        <div style={{ marginBottom: "12px", padding: "10px 14px", borderRadius: "10px", background: "rgba(79,142,247,0.08)", border: "1px solid rgba(79,142,247,0.18)", fontSize: "13px", color: "#355d8c" }}>
          本页负责报表查看、快照和分析。若要统一导出工资、税务底稿、资料包、凭证和报表打印版，请前往
          <button
            onClick={() => navigate("/pdf-export")}
            style={{ marginLeft: "6px", border: "none", background: "none", color: "#2563eb", cursor: "pointer", fontWeight: 600, padding: 0 }}
          >
            PDF 导出中心
          </button>
          。
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <select value={periodType} onChange={(event) => setPeriodType(event.target.value as typeof periodType)}>
            <option value="month">月度</option>
            <option value="quarter">季度</option>
            <option value="year">年度</option>
          </select>
          <input value={year} onChange={(event) => setYear(Number(event.target.value || 2026))} />
          {periodType === "month" ? (
            <input value={month} onChange={(event) => setMonth(Number(event.target.value || 1))} />
          ) : null}
          {periodType === "quarter" ? (
            <input value={quarter} onChange={(event) => setQuarter(Number(event.target.value || 1))} />
          ) : null}
          <button onClick={() => void loadReports()}>更新报表</button>
          <button
            onClick={() =>
              void createReportSnapshot({
                reportType: "balance_sheet",
                periodType,
                year,
                month,
                quarter
              })
                .then(() => listReportSnapshots())
                .then((payload) => {
                  setSnapshots(payload.items);
                  setMessage("已保存资产负债表快照。");
                })
                .catch((error) => setMessage((error as Error).message))
            }
          >
            保存资产负债表快照
          </button>
        </div>
      </article>

      <article style={panelStyle()}>
        <h3 style={{ marginTop: 0 }}>资产负债表</h3>
        {balanceSheet ? (
          <>
            <p>期末：{balanceSheet.asOfDate}</p>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={cellStyle()}>资产</th>
                  <th style={cellStyle()}>金额</th>
                  <th style={cellStyle()}>负债和权益</th>
                  <th style={cellStyle()}>金额</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: Math.max(balanceSheet.assets.length, balanceSheet.liabilities.length + balanceSheet.equity.length) }).map((_, index) => {
                  const asset = balanceSheet.assets[index];
                  const liabilityOrEquity = [...balanceSheet.liabilities, ...balanceSheet.equity][index];
                  return (
                    <tr key={index}>
                      <td style={cellStyle()}>{asset ? `${asset.code} ${asset.label}` : ""}</td>
                      <td style={cellStyle()}>{asset?.amount || ""}</td>
                      <td style={cellStyle()}>{liabilityOrEquity ? `${liabilityOrEquity.code} ${liabilityOrEquity.label}` : ""}</td>
                      <td style={cellStyle()}>{liabilityOrEquity?.amount || ""}</td>
                    </tr>
                  );
                })}
                <tr>
                  <td style={cellStyle()}>资产合计</td>
                  <td style={cellStyle()}>{balanceSheet.totals.assets}</td>
                  <td style={cellStyle()}>负债和权益合计</td>
                  <td style={cellStyle()}>{balanceSheet.totals.liabilitiesAndEquity}</td>
                </tr>
              </tbody>
            </table>
          </>
        ) : null}
      </article>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        <article style={panelStyle()}>
          <h3 style={{ marginTop: 0 }}>利润表</h3>
          {profitStatement ? (
            <>
              <p>期间：{profitStatement.periodLabel}</p>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={cellStyle()}>项目</th>
                    <th style={cellStyle()}>金额</th>
                  </tr>
                </thead>
                <tbody>
                  {[...profitStatement.revenues, ...profitStatement.costsAndExpenses].map((line) => (
                    <tr key={line.code}>
                      <td style={cellStyle()}>{line.label}</td>
                      <td style={cellStyle()}>{line.amount}</td>
                    </tr>
                  ))}
                  <tr><td style={cellStyle()}>营业收入</td><td style={cellStyle()}>{profitStatement.totals.revenue}</td></tr>
                  <tr><td style={cellStyle()}>营业成本</td><td style={cellStyle()}>{profitStatement.totals.cost}</td></tr>
                  <tr><td style={cellStyle()}>毛利润</td><td style={cellStyle()}>{profitStatement.totals.grossProfit}</td></tr>
                  <tr><td style={cellStyle()}>期间费用</td><td style={cellStyle()}>{profitStatement.totals.expenses}</td></tr>
                  <tr><td style={cellStyle()}>净利润</td><td style={cellStyle()}>{profitStatement.totals.netProfit}</td></tr>
                </tbody>
              </table>
            </>
          ) : null}
        </article>

        <article style={panelStyle()}>
          <h3 style={{ marginTop: 0 }}>现金流量表</h3>
          {cashFlow ? (
            <>
              <p>期间：{cashFlow.periodLabel}</p>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={cellStyle()}>项目</th>
                    <th style={cellStyle()}>金额</th>
                  </tr>
                </thead>
                <tbody>
                  {[...cashFlow.sections.operating, ...cashFlow.sections.investing, ...cashFlow.sections.financing].map((line) => (
                    <tr key={line.code}>
                      <td style={cellStyle()}>{line.label}</td>
                      <td style={cellStyle()}>{line.amount}</td>
                    </tr>
                  ))}
                  <tr><td style={cellStyle()}>经营净现金流</td><td style={cellStyle()}>{cashFlow.totals.operatingNetCash}</td></tr>
                  <tr><td style={cellStyle()}>投资净现金流</td><td style={cellStyle()}>{cashFlow.totals.investingNetCash}</td></tr>
                  <tr><td style={cellStyle()}>筹资净现金流</td><td style={cellStyle()}>{cashFlow.totals.financingNetCash}</td></tr>
                  <tr><td style={cellStyle()}>现金净增加额</td><td style={cellStyle()}>{cashFlow.totals.netCashChange}</td></tr>
                </tbody>
              </table>
            </>
          ) : null}
        </article>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        <article style={panelStyle()}>
          <h3 style={{ marginTop: 0 }}>报表快照</h3>
          <div style={{ fontSize: "12px", color: "#9aa5b4", marginBottom: "10px" }}>
            点击快照行可快速选为差异分析的基准或对比期
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={cellStyle()}>快照</th>
                <th style={cellStyle()}>日期</th>
                <th style={cellStyle()}>选为</th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((snapshot, idx) => {
                const label = snapshotLabel(snapshot);
                const isFrom = fromSnapshotId === snapshot.id;
                const isTo = toSnapshotId === snapshot.id;
                return (
                  <tr key={snapshot.id} style={{ background: isFrom ? "rgba(37,99,235,0.06)" : isTo ? "rgba(26,127,90,0.06)" : "transparent" }}>
                    <td style={cellStyle()}>
                      <div style={{ fontWeight: 500, fontSize: "13px" }}>{label}</div>
                      <div style={{ fontSize: "11px", color: "#9aa5b4", fontFamily: "monospace" }}>
                        SNP-{String(idx + 1).padStart(3, "0")}
                      </div>
                    </td>
                    <td style={cellStyle()}>{snapshot.snapshotDate}</td>
                    <td style={cellStyle()}>
                      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                        <button
                          onClick={() => setFromSnapshotId(snapshot.id)}
                          style={{
                            padding: "2px 8px", fontSize: "11px", borderRadius: "4px", cursor: "pointer", border: "1px solid rgba(37,99,235,0.4)",
                            background: isFrom ? "#2563eb" : "transparent",
                            color: isFrom ? "#fff" : "#2563eb"
                          }}
                        >基准</button>
                        <button
                          onClick={() => setToSnapshotId(snapshot.id)}
                          style={{
                            padding: "2px 8px", fontSize: "11px", borderRadius: "4px", cursor: "pointer", border: "1px solid rgba(26,127,90,0.4)",
                            background: isTo ? "#1a7f5a" : "transparent",
                            color: isTo ? "#fff" : "#1a7f5a"
                          }}
                        >对比</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {snapshots.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ ...cellStyle(), textAlign: "center", color: "#c4cdd6", padding: "24px" }}>
                    暂无快照，请先保存资产负债表快照
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </article>

        <article style={panelStyle()}>
          <h3 style={{ marginTop: 0 }}>报表差异分析</h3>
          <div style={{ display: "grid", gap: "10px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <div style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(37,99,235,0.3)", background: "rgba(37,99,235,0.04)", fontSize: "13px" }}>
                <div style={{ fontSize: "11px", color: "#6c7a89", marginBottom: "2px" }}>基准期</div>
                <div style={{ color: fromSnapshotId ? "#1e2a37" : "#c4cdd6" }}>
                  {fromSnapshotId
                    ? (snapshots.find((s) => s.id === fromSnapshotId) ? snapshotLabel(snapshots.find((s) => s.id === fromSnapshotId)!) : "已选")
                    : "请在左侧点击「基准」"}
                </div>
              </div>
              <div style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(26,127,90,0.3)", background: "rgba(26,127,90,0.04)", fontSize: "13px" }}>
                <div style={{ fontSize: "11px", color: "#6c7a89", marginBottom: "2px" }}>对比期</div>
                <div style={{ color: toSnapshotId ? "#1e2a37" : "#c4cdd6" }}>
                  {toSnapshotId
                    ? (snapshots.find((s) => s.id === toSnapshotId) ? snapshotLabel(snapshots.find((s) => s.id === toSnapshotId)!) : "已选")
                    : "请在左侧点击「对比」"}
                </div>
              </div>
            </div>
            <button
              onClick={() =>
                void getReportDiff(fromSnapshotId, toSnapshotId)
                  .then((payload) => {
                    setDiff(payload);
                    setMessage(`已生成 ${payload.reportType} 差异分析。`);
                  })
                  .catch((error) => setMessage((error as Error).message))
              }
            >
              生成差异分析
            </button>
            <button
              onClick={() =>
                void getChairmanReportSummary(toSnapshotId || fromSnapshotId)
                  .then((payload) => {
                    setChairmanSummary(payload);
                    setMessage("已生成老板口径摘要。");
                  })
                  .catch((error) => setMessage((error as Error).message))
              }
            >
              生成老板摘要
            </button>
            <button
              onClick={() =>
                void getPrintableReportHtml(toSnapshotId || fromSnapshotId)
                  .then((html) => {
                    const printableWindow = window.open("", "_blank", "noopener,noreferrer");
                    if (!printableWindow) {
                      throw new Error("无法打开打印窗口");
                    }
                    printableWindow.document.open();
                    printableWindow.document.write(html);
                    printableWindow.document.close();
                    setMessage("已生成报表打印版。");
                  })
                  .catch((error) => setMessage((error as Error).message))
              }
            >
              打开打印版
            </button>
            <button
              onClick={() =>
                void getClosingBundleHtml("month_end", balanceSheet?.periodLabel || `${year}-${String(month).padStart(2, "0")}`)
                  .then((html) => {
                    const printableWindow = window.open("", "_blank", "noopener,noreferrer");
                    if (!printableWindow) {
                      throw new Error("无法打开资料包窗口");
                    }
                    printableWindow.document.open();
                    printableWindow.document.write(html);
                    printableWindow.document.close();
                    setMessage("已打开月结资料包。");
                  })
                  .catch((error) => setMessage((error as Error).message))
              }
            >
              月结资料包
            </button>
            <button
              onClick={() =>
                void getClosingBundleHtml("audit", balanceSheet?.periodLabel || `${year}-Q${quarter}`)
                  .then((html) => {
                    const printableWindow = window.open("", "_blank", "noopener,noreferrer");
                    if (!printableWindow) {
                      throw new Error("无法打开资料包窗口");
                    }
                    printableWindow.document.open();
                    printableWindow.document.write(html);
                    printableWindow.document.close();
                    setMessage("已打开审计资料包。");
                  })
                  .catch((error) => setMessage((error as Error).message))
              }
            >
              审计资料包
            </button>
            <button
              onClick={() =>
                void getClosingBundleHtml("inspection", balanceSheet?.periodLabel || `${year}`)
                  .then((html) => {
                    const printableWindow = window.open("", "_blank", "noopener,noreferrer");
                    if (!printableWindow) {
                      throw new Error("无法打开资料包窗口");
                    }
                    printableWindow.document.open();
                    printableWindow.document.write(html);
                    printableWindow.document.close();
                    setMessage("已打开稽核资料包。");
                  })
                  .catch((error) => setMessage((error as Error).message))
              }
            >
              稽核资料包
            </button>
            {diff ? (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={cellStyle()}>项目</th>
                    <th style={cellStyle()}>期初</th>
                    <th style={cellStyle()}>期末</th>
                    <th style={cellStyle()}>差异</th>
                  </tr>
                </thead>
                <tbody>
                  {diff.lines.slice(0, 12).map((line) => (
                    <tr key={line.code}>
                      <td style={cellStyle()}>{line.label}</td>
                      <td style={cellStyle()}>{line.fromAmount}</td>
                      <td style={cellStyle()}>{line.toAmount}</td>
                      <td style={cellStyle()}>{line.delta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {chairmanSummary ? (
              <div style={{ marginTop: "16px", lineHeight: 1.8 }}>
                <div style={{ fontWeight: 700 }}>{chairmanSummary.headline}</div>
                <ul style={{ paddingLeft: "20px" }}>
                  {chairmanSummary.highlights.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <ul style={{ paddingLeft: "20px", color: "#b91c1c" }}>
                  {chairmanSummary.risks.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </article>
      </section>
    </section>
  );
}
