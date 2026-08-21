import { Card, Typography } from "antd";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { DashboardData } from "../../lib/api";
import { resolveExpenseChart } from "./expense-slices";

const { Text } = Typography;

const COLORS = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#dc2626"];

interface DashboardPieChartProps {
  data: DashboardData;
}

export function DashboardPieChart({ data }: DashboardPieChartProps) {
  const { slices: pieData, isEstimated } = resolveExpenseChart(data);

  return (
    <Card
      title={
        <span>
          <Text strong>本月费用构成</Text>
          {isEstimated && (
            // 估算必须写在脸上：老板会拿这张图判断「人工占比是不是太高」。
            <Text type="warning" style={{ fontSize: 11, marginLeft: 8 }}>
              内部拆分为估算值
            </Text>
          )}
        </span>
      }
      style={{ borderRadius: 12 }}
      styles={{ body: { paddingTop: 8 } }}
    >
      {pieData.length === 0 ? (
        <Text type="secondary" style={{ fontSize: 12 }}>
          本期还没有已过账的收入与费用。
        </Text>
      ) : (
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
      )}
    </Card>
  );
}
