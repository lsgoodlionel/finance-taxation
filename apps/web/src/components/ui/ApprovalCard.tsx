import React from "react";
import { Button, Space, Tag, Typography } from "antd";
import { CheckOutlined, CloseOutlined, RightOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";

const { Text } = Typography;

/**
 * V7 K1/A3 双轨审批卡：guided（白话）与 pro（紧凑 + 借贷全显）共用一套 props，
 * 驱动同一审批 API。组件本身不发请求，动作全部通过回调交给父级。
 */

export interface ApprovalCardLine {
  summary: string;
  accountLabel: string;
  debit: string;
  credit: string;
}

export interface ApprovalCardProps {
  variant: "guided" | "pro";
  /** 标题：guided 传白话句子，pro 传专业摘要。 */
  title: string;
  /** 影响说明一行（guided 重点展示，pro 降权小字）。 */
  impact?: string;
  /** 金额（元）。null/undefined 时不展示金额区。 */
  amount?: number | null;
  /** pro 形态的借贷分录明细。 */
  lines?: readonly ApprovalCardLine[];
  /** 详情页路径；提供时渲染「看详情」链接。 */
  detailPath?: string;
  /** 未提供 onApprove/onReject 时对应按钮不渲染（如纯提醒卡）。 */
  onApprove?: () => void;
  onReject?: () => void;
  approving?: boolean;
  rejecting?: boolean;
  /** 附加标签（如风险等级），插在标题右侧。 */
  extra?: React.ReactNode;
}

const GUIDED_BUTTON_STYLE: React.CSSProperties = {
  minHeight: 44,
  minWidth: 88,
  fontSize: 15,
  borderRadius: 10
};

function formatAmount(amount: number): string {
  return `¥${amount.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatLineAmount(value: string): string {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? formatAmount(n) : "—";
}

function DetailLink({ detailPath, guided }: { detailPath: string; guided: boolean }) {
  return (
    <Link to={detailPath} style={{ display: "inline-flex" }}>
      <Button style={guided ? GUIDED_BUTTON_STYLE : undefined} size={guided ? "middle" : "small"} icon={<RightOutlined />}>
        看详情
      </Button>
    </Link>
  );
}

function ProLines({ lines }: { lines: readonly ApprovalCardLine[] }) {
  return (
    <div style={{ display: "grid", gap: 4 }}>
      {lines.map((line, idx) => (
        <div
          key={`${line.accountLabel}-${idx}`}
          style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12, color: "#4d5d6c" }}
        >
          <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {line.summary} · {line.accountLabel}
          </span>
          <span style={{ fontFamily: "monospace" }}>借 {formatLineAmount(line.debit)}</span>
          <span style={{ fontFamily: "monospace" }}>贷 {formatLineAmount(line.credit)}</span>
        </div>
      ))}
    </div>
  );
}

export function ApprovalCard({
  variant,
  title,
  impact,
  amount,
  lines,
  detailPath,
  onApprove,
  onReject,
  approving = false,
  rejecting = false,
  extra
}: ApprovalCardProps) {
  const guided = variant === "guided";
  const hasAmount = typeof amount === "number" && Number.isFinite(amount);

  return (
    <div
      style={{
        display: "grid",
        gap: guided ? 12 : 8,
        padding: guided ? "16px 18px" : "10px 12px",
        borderRadius: guided ? 14 : 8,
        border: "1px solid rgba(20,40,60,0.08)",
        borderLeft: "3px solid #2563eb",
        background: "rgba(255,255,255,0.92)"
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <Text strong style={{ fontSize: guided ? 16 : 13, lineHeight: 1.6, flex: 1, minWidth: 200 }}>
          {title}
        </Text>
        {extra}
        {!guided && hasAmount ? <Tag color="blue">{formatAmount(amount)}</Tag> : null}
      </div>

      {guided && hasAmount ? (
        <Text style={{ fontSize: 22, fontWeight: 700, color: "#1e2a37" }}>{formatAmount(amount)}</Text>
      ) : null}

      {impact ? (
        <Text type="secondary" style={{ fontSize: guided ? 13 : 11, lineHeight: 1.6 }}>
          {impact}
        </Text>
      ) : null}

      {!guided && lines && lines.length > 0 ? <ProLines lines={lines} /> : null}

      <Space size={guided ? 12 : 8} wrap>
        {onApprove ? (
          <Button
            type="primary"
            icon={<CheckOutlined />}
            style={guided ? GUIDED_BUTTON_STYLE : undefined}
            size={guided ? "middle" : "small"}
            loading={approving}
            disabled={rejecting}
            onClick={onApprove}
          >
            批准
          </Button>
        ) : null}
        {onReject ? (
          <Button
            danger
            icon={<CloseOutlined />}
            style={guided ? GUIDED_BUTTON_STYLE : undefined}
            size={guided ? "middle" : "small"}
            loading={rejecting}
            disabled={approving}
            onClick={onReject}
          >
            驳回
          </Button>
        ) : null}
        {detailPath ? <DetailLink detailPath={detailPath} guided={guided} /> : null}
      </Space>
    </div>
  );
}
