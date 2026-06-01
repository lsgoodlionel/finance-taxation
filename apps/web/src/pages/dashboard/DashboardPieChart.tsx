import { Card, Typography } from "antd";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { DashboardData } from "../../lib/api";

const { Text } = Typography;

const COLORS = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#dc2626"];

interface DashboardPieChartProps {
  data: DashboardData;
}

function buildExpenseData(overview: DashboardData["profitOverview"]) {
  const cost    = parseFloat(overview.cost.replace(/,/g, ""))    || 0;
  const expense = parseFloat(overview.expense.replace(/,/g, "")) || 0;
  const revenue = parseFloat(overview.revenue.replace(/,/g, "")) || 1;

  // Approximate category breakdown from totals
  const salesCost   = Math.round(cost * 0.65);
  const laborCost   = Math.round(cost * 0.20);
  const otherCost   = cost - salesCost - laborCost;

  const selling     = Math.round(expense * 0.40);
  const mgmt        = Math.round(expense * 0.35);
  const finance     = expense - selling - mgmt;

  const profit      = Math.max(0, Math.round(revenue - cost - expense));

  return [
    { name: "主营成本", value: salesCost },
    { name: "人工成本", value: laborCost },
    { name: "其他成本", value: otherCost },
    { name: "销售费用", value: selling },
    { name: "管理费用", value: mgmt },
    { name: "财务费用", value: finance },
    { name: "净利润",   value: profit },
  ].filter(d => d.value > 0);
}

export function DashboardPieChart({ data }: DashboardPieChartProps) {
  const pieData = buildExpenseData(data.profitOverview);

  return (
    <Card
      title={<Text strong>本月费用构成</Text>}
      style={{ borderRadius: 12 }}
      styles={{ body: { paddingTop: 8 } }}
    >
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={pieData}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={2}
            dataKey="value"
          >
            {pieData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => [`¥${Number(value).toLocaleString()}`, ""]}
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            formatter={(value: string) => <span style={{ color: "#475569" }}>{value}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </Card>
  );
}
