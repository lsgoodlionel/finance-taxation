import { useState } from "react";
import { Button, Form, Input, InputNumber, Progress, Tag, Typography } from "antd";
import { getBudgetVariance, type BudgetVarianceResult } from "../../../lib/api";
import { DataTableShell } from "../../../components/ui/DataTableShell";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ResultBanner } from "../../../components/ui/ResultBanner";

const { Text } = Typography;

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

type BudgetVariancePanelProps = {
  defaultPeriod: string;
};

type StatusMeta = {
  label: string;
  color: string;
  progressStatus: "exception" | "success" | "active";
};

function getStatusMeta(status: BudgetVarianceResult["status"]): StatusMeta {
  if (status === "over") {
    return { label: "超支", color: "#dc2626", progressStatus: "exception" };
  }
  if (status === "under") {
    return { label: "结余", color: "#16a34a", progressStatus: "success" };
  }
  return { label: "持平", color: "#2563eb", progressStatus: "active" };
}

function formatYuan(value: number): string {
  const sign = value < 0 ? "-" : "";
  const absValue = Math.abs(value);
  return `${sign}¥${absValue.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function BudgetVariancePanel({ defaultPeriod }: BudgetVariancePanelProps) {
  const [period, setPeriod] = useState(defaultPeriod);
  const [budget, setBudget] = useState<number | null>(null);
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BudgetVarianceResult | null>(null);

  async function handleQuery() {
    if (!PERIOD_PATTERN.test(period)) {
      setError("期间格式需为 YYYY-MM，例如 2026-05。");
      return;
    }
    if (budget === null || budget < 0) {
      setError("请输入非负的预算金额（元）。");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = await getBudgetVariance({
        period,
        budget,
        category: category.trim() || undefined
      });
      setResult(payload);
    } catch (queryError) {
      setError((queryError as Error).message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const statusMeta = result ? getStatusMeta(result.status) : null;
  const utilizationPercent = result?.utilization === null || result?.utilization === undefined
    ? null
    : Math.round(result.utilization * 100);
  const varianceYuan = result ? result.actual - result.budget : 0;

  return (
    <DataTableShell
      title="预算差异分析"
      actions={<span style={{ fontSize: 12, color: "#64748b" }}>比对属期实际发生额与预算金额</span>}
    >
      <Form layout="inline" style={{ rowGap: 12, marginBottom: 16 }} onFinish={() => void handleQuery()}>
        <Form.Item label="期间" style={{ marginBottom: 0 }}>
          <Input
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
            placeholder="YYYY-MM"
            style={{ width: 120 }}
          />
        </Form.Item>
        <Form.Item label="预算金额（元）" style={{ marginBottom: 0 }}>
          <InputNumber
            value={budget}
            onChange={(value) => setBudget(typeof value === "number" ? value : null)}
            min={0}
            step={100}
            precision={2}
            style={{ width: 160 }}
            placeholder="请输入预算"
          />
        </Form.Item>
        <Form.Item label="科目前缀" style={{ marginBottom: 0 }}>
          <Input
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="留空=默认费用类，如 6601,6602"
            style={{ width: 220 }}
          />
        </Form.Item>
        <Form.Item style={{ marginBottom: 0 }}>
          <Button type="primary" htmlType="submit" loading={loading}>查询</Button>
        </Form.Item>
      </Form>

      {error ? <ResultBanner tone="error" message={error} /> : null}

      {!result ? (
        <EmptyState
          title="尚未查询预算差异"
          description="填写期间和预算金额后点击“查询”，可选填科目前缀缩小范围。"
        />
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <Progress
              type="circle"
              size={96}
              percent={utilizationPercent === null ? 0 : Math.min(100, utilizationPercent)}
              status={statusMeta?.progressStatus}
              strokeColor={statusMeta?.color}
              format={() => (utilizationPercent === null ? "预算为0" : `${utilizationPercent}%`)}
            />
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Text strong style={{ fontSize: 15 }}>{result.period} 执行情况</Text>
                <Tag color={statusMeta?.color}>{statusMeta?.label}</Tag>
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                科目范围：{result.category.length > 0 ? result.category.join("、") : "默认费用类"}
              </Text>
            </div>
          </div>

          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", padding: "12px 16px", background: "#f8fafc", borderRadius: 8 }}>
            <div>
              <div style={{ fontSize: 11, color: "#64748b" }}>实际发生额</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#1e2a37" }}>{formatYuan(result.actual)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#64748b" }}>预算金额</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: "#1e2a37" }}>{formatYuan(result.budget)}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#64748b" }}>差异（实际−预算）</div>
              <div style={{ fontWeight: 700, fontSize: 16, color: varianceYuan > 0 ? "#dc2626" : varianceYuan < 0 ? "#16a34a" : "#1e2a37" }}>
                {varianceYuan > 0 ? "+" : ""}{formatYuan(varianceYuan)}
              </div>
            </div>
          </div>
        </div>
      )}
    </DataTableShell>
  );
}
