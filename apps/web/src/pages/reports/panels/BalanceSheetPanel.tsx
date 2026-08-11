// 显式引入 React：Node 下的 SSR 单测走 classic JSX transform，缺它会 ReferenceError。
// （与 ProfitStatementPanel 同因；此前本文件没有 SSR 单测，所以一直没暴露。）
import React, { useState } from "react";
import { Alert, Segmented, Table, Typography } from "antd";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell,
} from "recharts";
import type { ColumnsType } from "antd/es/table";
import type { BalanceSheetReport, FinancialReportLine } from "@finance-taxation/domain-model";
import { DataTableShell } from "../../../components/ui/DataTableShell";
import { Term } from "../../../components/ui/Term";
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
    return <EmptyState title="暂无资产负债表" description="请先在页头选择期间并点「更新报表」，加载当前期间结果。" />;
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

  // 未分类科目告警（V12-A5）。后端此前会把归类不到的科目（如 4 开头的生产成本）
  // 静默丢弃，用户只看到一张莫名不平的表、无从查起。现在后端显式列出这些科目，
  // 这里必须把它呈出来——只在 API 响应里带着而界面不显示，等于没修。
  //
  // 用可选链是因为这是外部数据边界：老版本 API 或缓存响应可能没有这两个字段。
  const unclassifiedLines = report.unclassified ?? [];
  const warnings = report.warnings ?? [];
  const warningBanner = warnings.length > 0 || unclassifiedLines.length > 0 ? (
    <Alert
      type="warning"
      showIcon
      style={{ marginBottom: 12 }}
      title="有科目未纳入资产负债表口径"
      description={
        <div style={{ fontSize: 12 }}>
          {warnings.map((text) => <div key={text}>{text}</div>)}
          {unclassifiedLines.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {unclassifiedLines.map((item) => (
                <div key={item.code}>
                  {item.code} {item.label}：{item.amount}
                </div>
              ))}
            </div>
          )}
        </div>
      }
    />
  ) : null;

  // 恒等式自检（V12 收尾）。这一段的存在理由与上面的 warningBanner 完全相同：
  // 自检从 B5 起就算得出「差额是多少、能不能被未结转损益解释」，但只在
  // /api/ledger/balance-check 里，而看报表的人不会去调另一个接口。
  //
  // 三档呈现刻意分开：
  // - residual ≠ 0 → 总账借贷不平，是真错账，报 error；
  // - 有未结账年度 → 差额可解释但需要人去做年结，报 warning；
  // - 其余 notice → 信息性提示。
  const selfCheck = report.selfCheck;
  const selfCheckBanner = selfCheck && selfCheck.notice ? (
    <Alert
      type={selfCheck.residual !== 0 ? "error" : "warning"}
      showIcon
      style={{ marginBottom: 12 }}
      title={
        selfCheck.residual !== 0
          ? "资产负债表不平，且差额无法被未结转损益解释"
          : "资产负债表差额可被解释，但仍有待办"
      }
      description={
        <div style={{ fontSize: 12 }}>
          <div>{selfCheck.notice}</div>
          <div style={{ marginTop: 6, color: "#64748b" }}>
            资产 {selfCheck.assets.toFixed(2)} − 负债 {selfCheck.liabilities.toFixed(2)} − 权益{" "}
            {selfCheck.equity.toFixed(2)} = {selfCheck.difference.toFixed(2)}
            ；其中未<Term k="close-income">结转损益</Term> {selfCheck.unclosedProfitLoss.toFixed(2)}
            {selfCheck.unclassified !== 0 ? `，未分类科目 ${selfCheck.unclassified.toFixed(2)}` : ""}
            {selfCheck.residual !== 0 ? `，无法解释的残差 ${selfCheck.residual.toFixed(2)}` : ""}
          </div>
          {selfCheck.openFiscalYears.length > 0 && (
            <div style={{ marginTop: 6 }}>
              尚未年结的年度：
              {selfCheck.openFiscalYears
                .map((item) => `${item.year} 年（本年利润 ${item.currentYearProfitBalance.toFixed(2)}）`)
                .join("、")}
            </div>
          )}
        </div>
      }
    />
  ) : null;

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
      {warningBanner}
      {selfCheckBanner}
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
