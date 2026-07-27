import { Card, Typography } from "antd";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { DashboardData } from "../../lib/api";
import { buildExpenseData } from "./expense-slices";

const { Text } = Typography;

const COLORS = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#dc2626"];

interface DashboardPieChartProps {
  data: DashboardData;
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
