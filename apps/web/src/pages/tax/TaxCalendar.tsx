import { useMemo } from "react";
import { Card, Badge, Tag, Typography, Row, Col, Tooltip } from "antd";
import { CheckCircleOutlined, ClockCircleOutlined, WarningOutlined, CalendarOutlined } from "@ant-design/icons";
import type { TaxFilingBatch } from "@finance-taxation/domain-model";

const { Text } = Typography;

// Standard Chinese tax deadlines (day of month)
const TAX_SCHEDULE = [
  { taxType: "vat",    label: "增值税",    dueDay: 15, frequency: "monthly",   color: "#2563eb", bg: "#eff6ff" },
  { taxType: "iit",    label: "个人所得税", dueDay: 15, frequency: "monthly",   color: "#7c3aed", bg: "#f5f3ff" },
  { taxType: "stamp",  label: "印花税",    dueDay: 15, frequency: "monthly",   color: "#d97706", bg: "#fffbeb" },
  { taxType: "cit",    label: "企业所得税", dueDay: 15, frequency: "quarterly", color: "#16a34a", bg: "#f0fdf4" },
] as const;

type TaxType = typeof TAX_SCHEDULE[number]["taxType"];

interface TaxObligation {
  taxType: TaxType;
  label: string;
  dueDay: number;
  frequency: "monthly" | "quarterly";
  color: string;
  bg: string;
  dueDate: Date;
  daysRemaining: number;
  status: "filed" | "pending" | "overdue";
  batchId: string | null;
  batchStatus: string | null;
}

interface Props {
  batches: TaxFilingBatch[];
  currentPeriod?: string;   // YYYY-MM format
}

function getCurrentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function isQuarterEnd(month: number): boolean {
  return month === 3 || month === 6 || month === 9 || month === 12;
}

export function TaxCalendar({ batches, currentPeriod }: Props) {
  const period = currentPeriod ?? getCurrentPeriod();
  const parts = period.split("-");
  const year = parseInt(parts[0] ?? "2024", 10);
  const month = parseInt(parts[1] ?? "1", 10);

  const obligations = useMemo((): TaxObligation[] => {
    const today = new Date();

    return TAX_SCHEDULE.map((t) => {
      // Skip quarterly taxes if not quarter end
      if (t.frequency === "quarterly" && !isQuarterEnd(month)) {
        return null;
      }

      // Due date is next month's 15th (e.g., Jan period → Feb 15)
      const dueDate = new Date(year, month, t.dueDay); // month is already 1-based, so `month` = next month
      const daysRemaining = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      // Find matching batch
      const batch = batches.find((b) => {
        const bType = b.taxType.toLowerCase();
        return bType.includes(t.taxType) && b.filingPeriod.startsWith(period);
      }) ?? null;

      const status: TaxObligation["status"] =
        batch && (batch.status === "submitted" || batch.status === "archived")
          ? "filed"
          : daysRemaining < 0
          ? "overdue"
          : "pending";

      return {
        ...t,
        dueDate,
        daysRemaining,
        status,
        batchId: batch?.id ?? null,
        batchStatus: batch?.status ?? null,
      } as TaxObligation;
    }).filter(Boolean) as TaxObligation[];
  }, [batches, period, year, month]);

  const filedCount = obligations.filter((o) => o.status === "filed").length;
  const overdueCount = obligations.filter((o) => o.status === "overdue").length;

  function renderStatusIcon(o: TaxObligation) {
    if (o.status === "filed") return <CheckCircleOutlined style={{ color: "#16a34a", fontSize: 16 }} />;
    if (o.status === "overdue") return <WarningOutlined style={{ color: "#dc2626", fontSize: 16 }} />;
    return <ClockCircleOutlined style={{ color: o.daysRemaining <= 7 ? "#d97706" : "#64748b", fontSize: 16 }} />;
  }

  function renderDueTag(o: TaxObligation) {
    if (o.status === "filed") return <Tag color="success">已申报</Tag>;
    if (o.status === "overdue") return <Tag color="error">已逾期 {Math.abs(o.daysRemaining)} 天</Tag>;
    if (o.daysRemaining <= 3) return <Tag color="warning">还剩 {o.daysRemaining} 天</Tag>;
    return <Tag color="default">还剩 {o.daysRemaining} 天</Tag>;
  }

  return (
    <Card
      title={(
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <CalendarOutlined style={{ color: "#2563eb" }} />
          <span>税务日历</span>
          <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
            {period.replace("-", "年")}月申报义务
          </Text>
        </div>
      )}
      extra={(
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {overdueCount > 0 && (
            <Badge count={overdueCount} color="red">
              <Text type="danger" style={{ fontSize: 12 }}>逾期</Text>
            </Badge>
          )}
          <Text type="secondary" style={{ fontSize: 12 }}>
            已完成 {filedCount}/{obligations.length}
          </Text>
        </div>
      )}
      styles={{ body: { padding: "16px 20px" } }}
    >
      <Row gutter={[12, 12]}>
        {obligations.map((o) => (
          <Col xs={24} sm={12} md={6} key={o.taxType}>
            <div
              style={{
                background: o.status === "filed" ? "#f0fdf4" : o.status === "overdue" ? "#fef2f2" : o.bg,
                border: `1px solid ${o.status === "filed" ? "#bbf7d0" : o.status === "overdue" ? "#fecaca" : `${o.color}33`}`,
                borderRadius: 10,
                padding: "12px 14px",
                display: "grid",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Text strong style={{ fontSize: 13, color: o.color }}>{o.label}</Text>
                {renderStatusIcon(o)}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Tooltip title={`申报截止：${o.dueDate.toLocaleDateString("zh-CN")}`}>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    截止 {o.dueDate.getMonth() + 1}月{o.dueDate.getDate()}日
                  </Text>
                </Tooltip>
                {renderDueTag(o)}
              </div>
              {o.batchStatus && (
                <Text type="secondary" style={{ fontSize: 10 }}>
                  批次状态：{
                    o.batchStatus === "submitted" ? "已提交"
                    : o.batchStatus === "archived" ? "已归档"
                    : o.batchStatus === "ready" ? "可提交"
                    : o.batchStatus === "review_required" ? "待复核"
                    : "草稿"
                  }
                </Text>
              )}
            </div>
          </Col>
        ))}
        {obligations.length === 0 && (
          <Col span={24}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              本月（{period}）无企业所得税等季度申报义务，仅常规月度申报（增值税/个税/印花税）。
            </Text>
          </Col>
        )}
      </Row>
    </Card>
  );
}
