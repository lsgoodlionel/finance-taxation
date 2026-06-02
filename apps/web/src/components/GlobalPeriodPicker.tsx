import { DatePicker, Typography } from "antd";
import { CalendarOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { usePeriod } from "../lib/period-context";

const { Text } = Typography;

/**
 * 全局会计期间选择器（顶栏）。选定后所有期间相关页面默认跟随。
 */
export function GlobalPeriodPicker({ compact = false }: { compact?: boolean }) {
  const { period, setPeriod } = usePeriod();
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {!compact && <Text style={{ color: "#94a3b8", fontSize: 12 }}>会计期间</Text>}
      <DatePicker
        picker="month"
        size="small"
        allowClear={false}
        suffixIcon={<CalendarOutlined style={{ color: "#64748b" }} />}
        value={dayjs(period + "-01")}
        format="YYYY-MM"
        onChange={(d) => { if (d) setPeriod(d.format("YYYY-MM")); }}
        aria-label="全局会计期间"
        style={{ width: 130 }}
      />
    </div>
  );
}
