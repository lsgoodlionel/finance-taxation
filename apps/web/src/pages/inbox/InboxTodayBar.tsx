/**
 * 收件箱 · 「今天的状况」。
 *
 * 合并了改造前彼此重复的四个区块：
 * 1) 4 个 Statistic 统计条 —— 其中「其他模块待办类别 n/m」是元数据，不是待办，已删；
 * 2) 紧急 Alert —— 它讲的就是统计条里那个「紧急」数字，不必再占一整条横幅；
 * 3) 逐税种铺开的申报到期卡 —— 压成一句可点提示，明细回 /tax 的「看到期与提醒」；
 * 4) 快速开始 checklist —— 收成一行可折叠区，做完即整块消失。
 *
 * 这一块只回答「今天整体什么状况、有没有火要救」，具体处理仍在下面的待办卡里。
 */
import React from "react";
import { Space, Typography } from "antd";
import { RightOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import type { OnboardingChecklist } from "../../lib/onboarding-checklist";
import type { WorkspaceMode } from "../../lib/workspace-mode";
import { InboxQuickStart } from "./InboxQuickStart";
import { formatTaxDeadlineHint, type InboxFocusSummary, type TaxDeadlineSummary } from "./inbox-focus";

const { Text } = Typography;

/** 到期提醒跳到税务中心的哪件事（与 pages/tax/tax-tasks.ts 的 calendar 一致）。 */
const TAX_DEADLINE_PATH = "/tax?task=calendar";

const HEADING_ID = "inbox-today-heading";

const HEADING_STYLE: React.CSSProperties = {
  margin: 0,
  fontSize: 16,
  lineHeight: 1.3,
  color: "#1e2a37"
};

const METRIC_ROW_STYLE: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px 28px",
  alignItems: "baseline"
};

const METRIC_VALUE_STYLE: React.CSSProperties = { fontSize: 24, fontWeight: 700, lineHeight: 1.2 };

const METRIC_LABEL_STYLE: React.CSSProperties = { fontSize: 12, color: "#6b7a8d" };

const DEADLINE_BUTTON_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "8px 12px",
  textAlign: "left",
  font: "inherit",
  fontSize: 13,
  borderRadius: 10,
  cursor: "pointer"
};

interface MetricProps {
  label: string;
  value: number;
  tone?: "danger" | "warning" | "neutral";
}

function Metric({ label, value, tone = "neutral" }: MetricProps) {
  const color = tone === "danger" ? "#dc2626" : tone === "warning" ? "#d97706" : "#1e2a37";
  return (
    <div>
      <div style={{ ...METRIC_VALUE_STYLE, color }}>{value}</div>
      <div style={METRIC_LABEL_STYLE}>{label}</div>
    </div>
  );
}

interface InboxTodayBarProps {
  summary: InboxFocusSummary;
  deadlines: TaxDeadlineSummary | null;
  period: string;
  checklist: OnboardingChecklist | null;
  mode: WorkspaceMode;
  /** 全清时给一句庆祝语——取代改造前那个单独占一块的空状态卡。 */
  allClear: boolean;
}

export function InboxTodayBar({
  summary,
  deadlines,
  period,
  checklist,
  mode,
  allClear
}: InboxTodayBarProps) {
  const navigate = useNavigate();
  const hasUrgent = summary.urgentTotal > 0;
  const showQuickStart = checklist !== null && !checklist.ready;

  return (
    <section
      className="v3-section-shell"
      data-tone="accent"
      data-testid="inbox-today-bar"
      aria-labelledby={HEADING_ID}
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <h2 id={HEADING_ID} style={HEADING_STYLE}>今天的状况</h2>
        <div style={METRIC_ROW_STYLE}>
          <Metric label="今天待处理" value={summary.totalPending} />
          <Metric
            label="紧急（逾期任务 / 高危风险）"
            value={summary.urgentTotal}
            tone={hasUrgent ? "danger" : "neutral"}
          />
          <Metric
            label="等您审批"
            value={summary.approvalCount}
            tone={summary.approvalCount > 0 ? "warning" : "neutral"}
          />
          {hasUrgent && (
            <Text type="danger" role="status" style={{ fontSize: 12 }}>
              建议先处理逾期任务与高危风险，再看其余待办。
            </Text>
          )}
          {!hasUrgent && allClear && (
            <Text type="success" role="status" style={{ fontSize: 12 }}>
              太棒了，当前没有待办事项 🎉
            </Text>
          )}
        </div>

        {deadlines && (
          <button
            type="button"
            onClick={() => navigate(TAX_DEADLINE_PATH)}
            aria-label={`${period} 申报到期提醒：${formatTaxDeadlineHint(deadlines)}，前往税务中心查看到期与提醒`}
            style={{
              ...DEADLINE_BUTTON_STYLE,
              border: `1px solid ${deadlines.overdueCount > 0 ? "rgba(220,38,38,0.25)" : "rgba(20,40,60,0.10)"}`,
              background: deadlines.overdueCount > 0 ? "rgba(220,38,38,0.06)" : "#fff",
              color: deadlines.overdueCount > 0 ? "#b91c1c" : "#1e2a37"
            }}
          >
            <span aria-hidden="true">📅</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              {period} 申报到期：{formatTaxDeadlineHint(deadlines)}
            </span>
            <span style={{ fontSize: 12, color: "#6b7a8d" }}>去税务中心看明细</span>
            <RightOutlined aria-hidden="true" style={{ fontSize: 11 }} />
          </button>
        )}

        {showQuickStart && checklist && <InboxQuickStart checklist={checklist} mode={mode} />}
      </Space>
    </section>
  );
}
