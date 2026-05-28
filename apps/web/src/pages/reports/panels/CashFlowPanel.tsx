import { useState } from "react";
import { Segmented, Table, Typography, Collapse } from "antd";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, LabelList,
} from "recharts";
import type { ColumnsType } from "antd/es/table";
import type { CashFlowReport, FinancialReportLine } from "@finance-taxation/domain-model";
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
  report: CashFlowReport | null;
}

export function CashFlowPanel({ report }: Props) {
  const [view, setView] = useState<View>("table");

  if (!report) {
    return <EmptyState title="暂无现金流量表" description="请先在左侧更新报表，加载当前期间结果。" />;
  }

  const { totals } = report;

  const summaryData = [
    { name: "经营活动", value: parseAmt(totals.operatingNetCash), color: "#2563eb" },
    { name: "投资活动", value: parseAmt(totals.investingNetCash), color: "#d97706" },
    { name: "筹资活动", value: parseAmt(totals.financingNetCash), color: "#7c3aed" },
    { name: "净增加额", value: parseAmt(totals.netCashChange), color: "#16a34a" },
  ];

  const makeLineColumns = (): ColumnsType<FinancialReportLine> => [
    { title: "项目", dataIndex: "label" },
    {
      title: "金额",
      dataIndex: "amount",
      align: "right" as const,
      render: (v: string) => (
        <Text strong style={{ color: parseAmt(v) < 0 ? "#dc2626" : undefined }}>{v}</Text>
      ),
    },
  ];

  const collapseItems = [
    {
      key: "operating",
      label: <span style={{ fontWeight: 600, color: "#2563eb" }}>经营活动现金流 — {totals.operatingNetCash}</span>,
      children: (
        <Table rowKey="code" columns={makeLineColumns()} dataSource={report.sections.operating} pagination={false} size="small" />
      ),
    },
    {
      key: "investing",
      label: <span style={{ fontWeight: 600, color: "#d97706" }}>投资活动现金流 — {totals.investingNetCash}</span>,
      children: (
        <Table rowKey="code" columns={makeLineColumns()} dataSource={report.sections.investing} pagination={false} size="small" />
      ),
    },
    {
      key: "financing",
      label: <span style={{ fontWeight: 600, color: "#7c3aed" }}>筹资活动现金流 — {totals.financingNetCash}</span>,
      children: (
        <Table rowKey="code" columns={makeLineColumns()} dataSource={report.sections.financing} pagination={false} size="small" />
      ),
    },
  ];

  return (
    <DataTableShell
      title="现金流量表"
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
        <div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={summaryData} margin={{ top: 16, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={fmtYAxis} tick={{ fontSize: 11 }} width={60} />
              <Tooltip
                formatter={(v: unknown) => [`¥${(v as number).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`, "净现金"]}
              />
              <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={2} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                <LabelList dataKey="value" position="top" formatter={(v: unknown) => typeof v === "number" ? fmtYAxis(v) : ""} style={{ fontSize: 11 }} />
                {summaryData.map((entry) => (
                  <Cell key={entry.name} fill={entry.value < 0 && entry.name !== "净增加额" ? "#f87171" : entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12, padding: "12px 16px", background: "#f8fafc", borderRadius: 8 }}>
            {summaryData.map((d) => (
              <div key={d.name}>
                <div style={{ fontSize: 11, color: "#64748b" }}>{d.name}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: d.value < 0 ? "#dc2626" : d.color }}>
                  {d.name === "经营活动" ? totals.operatingNetCash
                    : d.name === "投资活动" ? totals.investingNetCash
                    : d.name === "筹资活动" ? totals.financingNetCash
                    : totals.netCashChange}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <Collapse
          defaultActiveKey={["operating"]}
          items={collapseItems}
          style={{ background: "transparent", border: "none" }}
        />
      )}
    </DataTableShell>
  );
}
