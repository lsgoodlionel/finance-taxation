import { useState } from "react";
import { Segmented, Table, Typography, Tag } from "antd";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import type { ColumnsType } from "antd/es/table";
import type { ProfitStatementReport, FinancialReportLine } from "@finance-taxation/domain-model";
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
  report: ProfitStatementReport | null;
}

export function ProfitStatementPanel({ report }: Props) {
  const [view, setView] = useState<View>("table");

  if (!report) {
    return <EmptyState title="暂无利润表" description="请先在左侧更新报表，加载当前期间结果。" />;
  }

  const totals = report.totals;
  const chartData = [
    { name: "营业收入", value: parseAmt(totals.revenue) },
    { name: "营业成本", value: parseAmt(totals.cost) },
    { name: "毛利润", value: parseAmt(totals.grossProfit) },
    { name: "期间费用", value: parseAmt(totals.expenses) },
    { name: "净利润", value: parseAmt(totals.netProfit) },
  ];

  const lineItems = [...report.revenues, ...report.costsAndExpenses];

  const columns: ColumnsType<FinancialReportLine> = [
    {
      title: "项目",
      dataIndex: "label",
      render: (v: string, _: FinancialReportLine, idx: number) => (
        <span>
          <Tag color={idx < report.revenues.length ? "blue" : "orange"} style={{ fontSize: 10 }}>
            {idx < report.revenues.length ? "收入" : "成本/费用"}
          </Tag>
          {" "}{v}
        </span>
      ),
    },
    {
      title: "金额",
      dataIndex: "amount",
      align: "right" as const,
      render: (v: string) => (
        <Text strong style={{ color: parseAmt(v) < 0 ? "#dc2626" : undefined }}>{v}</Text>
      ),
    },
  ];

  const summaryRows = [
    { label: "营业收入", amount: totals.revenue, kind: "neutral" },
    { label: "营业成本", amount: totals.cost, kind: "neutral" },
    { label: "毛利润", amount: totals.grossProfit, kind: "highlight" },
    { label: "期间费用", amount: totals.expenses, kind: "neutral" },
    { label: "利润总额", amount: totals.totalProfit, kind: "neutral" },
    { label: "净利润", amount: totals.netProfit, kind: "highlight" },
  ] as const;

  const barFill = (v: number, name: string) => {
    if (name === "营业成本" || name === "期间费用") return "#f87171";
    return v < 0 ? "#dc2626" : "#2563eb";
  };

  return (
    <DataTableShell
      title="利润表"
      actions={
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>期间：{report.periodLabel}</span>
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
        <>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 12, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={fmtYAxis} tick={{ fontSize: 11 }} width={60} />
              <Tooltip
                formatter={(v: unknown) => [`¥${(v as number).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`, "金额"]}
              />
              <ReferenceLine y={0} stroke="#94a3b8" />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell key={entry.name} fill={barFill(entry.value, entry.name)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12, padding: "12px 16px", background: "#f8fafc", borderRadius: 8 }}>
            {summaryRows.filter((r) => r.kind === "highlight").map((r) => (
              <div key={r.label}>
                <div style={{ fontSize: 11, color: "#64748b" }}>{r.label}</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: parseAmt(r.amount) < 0 ? "#dc2626" : "#16a34a" }}>
                  {r.amount}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <Table
            rowKey={(r) => r.code}
            columns={columns}
            dataSource={lineItems}
            pagination={false}
            size="small"
            style={{ marginBottom: 8 }}
          />
          <div style={{ borderTop: "2px solid #e2e8f0", paddingTop: 8 }}>
            {summaryRows.map((r) => (
              <div
                key={r.label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "6px 8px",
                  background: r.kind === "highlight" ? "#f0fdf4" : undefined,
                  fontWeight: r.kind === "highlight" ? 600 : undefined,
                  borderRadius: 4,
                }}
              >
                <span>{r.label}</span>
                <Text strong={r.kind === "highlight"} style={{ color: parseAmt(r.amount) < 0 ? "#dc2626" : undefined }}>
                  {r.amount}
                </Text>
              </div>
            ))}
          </div>
        </>
      )}
    </DataTableShell>
  );
}
