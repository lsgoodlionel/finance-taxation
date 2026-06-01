import { useState } from "react";
import { Segmented, Table, Typography } from "antd";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell,
} from "recharts";
import type { ColumnsType } from "antd/es/table";
import type { BalanceSheetReport, FinancialReportLine } from "@finance-taxation/domain-model";
import { DataTableShell } from "../../../components/ui/DataTableShell";
import { EmptyState } from "../../../components/ui/EmptyState";

const { Text } = Typography;

function parseAmt(s: string): number {
  const cleaned = (s ?? "").replace(/[¥,\s]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function fmtYAxis(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 10000) return `${(v / 10000).toFixed(0)}万`;
  return String(v);
}

type View = "table" | "chart";

interface Props {
  report: BalanceSheetReport | null;
}

export function BalanceSheetPanel({ report }: Props) {
  const [view, setView] = useState<View>("table");

  if (!report) {
    return <EmptyState title="暂无资产负债表" description="请先在左侧更新报表，加载当前期间结果。" />;
  }

  // Top-N items for chart (up to 8 each side to keep legible)
  const TOP_N = 8;
  const topAssets = report.assets.slice(0, TOP_N);
  const topLiab = [...report.liabilities, ...report.equity].slice(0, TOP_N);

  const chartData = [
    {
      name: "总资产",
      资产: parseAmt(report.totals.assets),
      负债: parseAmt(report.totals.liabilities),
      权益: parseAmt(report.totals.equity),
    },
  ];

  // Per-line chart data for assets side
  const assetLineData = topAssets.map((a) => ({
    name: a.label.length > 8 ? `${a.label.slice(0, 8)}…` : a.label,
    value: parseAmt(a.amount),
  }));

  const liabLineData = topLiab.map((l) => ({
    name: l.label.length > 8 ? `${l.label.slice(0, 8)}…` : l.label,
    value: parseAmt(l.amount),
  }));

  const liabEquityItems = [...report.liabilities, ...report.equity];
  const maxLen = Math.max(report.assets.length, liabEquityItems.length);

  // Antd Table for two-column layout
  const tableData = Array.from({ length: maxLen }, (_, idx) => ({
    key: idx,
    assetLabel: report.assets[idx] ? `${report.assets[idx].code} ${report.assets[idx].label}` : "",
    assetAmount: report.assets[idx]?.amount ?? "",
    liabLabel: liabEquityItems[idx] ? `${liabEquityItems[idx].code} ${liabEquityItems[idx].label}` : "",
    liabAmount: liabEquityItems[idx]?.amount ?? "",
  }));

  const columns: ColumnsType<typeof tableData[0]> = [
    { title: "资产", dataIndex: "assetLabel" },
    { title: "金额", dataIndex: "assetAmount", align: "right" as const, render: (v: string) => <Text strong>{v}</Text> },
    { title: "负债和权益", dataIndex: "liabLabel" },
    { title: "金额", dataIndex: "liabAmount", align: "right" as const, render: (v: string) => <Text strong>{v}</Text> },
  ];

  return (
    <DataTableShell
      title="资产负债表"
      actions={
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>期末：{report.asOfDate}</span>
          <Segmented
            size="small"
            value={view}
            onChange={(v) => setView(v as View)}
            options={[{ label: "表格", value: "table" }, { label: "图表", value: "chart" }]}
          />
        </div>
      }
    >
      {view === "chart" ? (
        <div style={{ display: "grid", gap: 24 }}>
          {/* Overview bar */}
          <div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>总量对比（资产 vs 负债 + 权益）</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tickFormatter={fmtYAxis} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={50} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: unknown) => [`¥${(v as number).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`, ""]} />
                <Legend />
                <Bar dataKey="资产" fill="#2563eb" radius={[0, 4, 4, 0]} />
                <Bar dataKey="负债" fill="#f87171" radius={[0, 4, 4, 0]} />
                <Bar dataKey="权益" fill="#16a34a" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* Assets breakdown */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>主要资产分布</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={assetLineData} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
                  <YAxis tickFormatter={fmtYAxis} tick={{ fontSize: 10 }} width={55} />
                  <Tooltip formatter={(v: unknown) => [`¥${(v as number).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`, "金额"]} />
                  <Bar dataKey="value" name="金额" fill="#2563eb" radius={[4, 4, 0, 0]}>
                    {assetLineData.map((_, i) => (
                      <Cell key={i} fill={`hsl(${220 - i * 10}, 70%, ${55 + i * 3}%)`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>主要负债和权益</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={liabLineData} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} />
                  <YAxis tickFormatter={fmtYAxis} tick={{ fontSize: 10 }} width={55} />
                  <Tooltip formatter={(v: unknown) => [`¥${(v as number).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`, "金额"]} />
                  <Bar dataKey="value" name="金额" fill="#f87171" radius={[4, 4, 0, 0]}>
                    {liabLineData.map((_, i) => (
                      <Cell key={i} fill={`hsl(${0 + i * 15}, 65%, ${55 + i * 2}%)`} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          {/* Summary */}
          <div style={{ display: "flex", gap: 24, padding: "12px 16px", background: "#f8fafc", borderRadius: 8 }}>
            <div><div style={{ fontSize: 11, color: "#64748b" }}>资产合计</div><div style={{ fontWeight: 700, fontSize: 16, color: "#2563eb" }}>{report.totals.assets}</div></div>
            <div><div style={{ fontSize: 11, color: "#64748b" }}>负债合计</div><div style={{ fontWeight: 700, fontSize: 16, color: "#dc2626" }}>{report.totals.liabilities}</div></div>
            <div><div style={{ fontSize: 11, color: "#64748b" }}>所有者权益</div><div style={{ fontWeight: 700, fontSize: 16, color: "#16a34a" }}>{report.totals.equity}</div></div>
          </div>
        </div>
      ) : (
        <>
          <Table
            rowKey="key"
            columns={columns}
            dataSource={tableData}
            pagination={false}
            size="small"
            footer={() => (
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                <span>资产合计：{report.totals.assets}</span>
                <span>负债和权益合计：{report.totals.liabilitiesAndEquity}</span>
              </div>
            )}
          />
        </>
      )}
    </DataTableShell>
  );
}
