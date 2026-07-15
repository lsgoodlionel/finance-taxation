/**
 * 收件箱 · 单条 AI 草稿行
 * 从 InboxAiDraftsCard 拆出，展示单条草稿的摘要/分级/分录明细与批准驳回操作。
 * V7 Stage L：批量勾选 Checkbox、键盘高亮态、受控展开（Enter 热键）、
 * 借贷合计校验（借=贷 ✓）与来源事项回溯链接。
 */
import type { CSSProperties } from "react";
import { Button, Checkbox, Collapse, Input, Popconfirm, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { CheckOutlined, CloseOutlined, LinkOutlined } from "@ant-design/icons";
import type { CloseDraft, CloseDraftLine } from "../../lib/api";
import { computeDraftTotals, formatCny, toAmount } from "./draft-batch";

const { Text } = Typography;

const PROPOSAL_LEVEL_META: Record<string, { color: string; label: string }> = {
  auto: { color: "success", label: "自动" },
  suggest: { color: "warning", label: "建议" },
  manual: { color: "error", label: "人工" },
};

function proposalLevelTag(level: CloseDraft["proposalLevel"]) {
  const meta = level ? PROPOSAL_LEVEL_META[level] : undefined;
  return <Tag color={meta?.color ?? "default"}>{meta?.label ?? "未知级别"}</Tag>;
}

function balancedTag(balanced: boolean | null) {
  if (balanced === true) return <Tag color="success">借贷平衡</Tag>;
  if (balanced === false) return <Tag color="error">不平衡</Tag>;
  return <Tag>待校验</Tag>;
}

// 后端把 debit/credit 序列化为「元」字符串（如 "1000.00"）。防御性转数字，避免
// 对字符串调用 .toFixed 抛错（H-2）。
function formatYuan(v: number | string): string {
  const n = toAmount(v);
  return n > 0 ? formatCny(n) : "—";
}

const LINE_COLUMNS: ColumnsType<CloseDraftLine> = [
  { title: "摘要", dataIndex: "summary", key: "summary" },
  { title: "科目", key: "account", render: (_v, line) => `${line.accountCode} ${line.accountName}` },
  { title: "借方", dataIndex: "debit", key: "debit", align: "right", render: formatYuan },
  { title: "贷方", dataIndex: "credit", key: "credit", align: "right", render: formatYuan },
];

/** 借贷合计校验展示：借 X = 贷 Y ✓ / ✗ */
function DraftTotalsCheck({ lines }: { lines: readonly CloseDraftLine[] }) {
  const totals = computeDraftTotals(lines);
  return (
    <Text type={totals.isBalanced ? "success" : "danger"} style={{ fontSize: 11 }}>
      借 {formatCny(totals.debit)} {totals.isBalanced ? "=" : "≠"} 贷 {formatCny(totals.credit)}{" "}
      {totals.isBalanced ? "✓" : "✗"}
    </Text>
  );
}

interface InboxAiDraftItemProps {
  draft: CloseDraft;
  reason: string;
  onReasonChange: (value: string) => void;
  acting: "approve" | "reject" | null;
  onApprove: () => void;
  onReject: () => void;
  isSelected: boolean;
  onSelectedChange: (checked: boolean) => void;
  /** 键盘 j/k 高亮态：左侧蓝条 + 浅底。 */
  isActive: boolean;
  /** 分录明细展开态（受控，Enter 热键切换）。 */
  isExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** 来源事项回溯：跳转 /events 深链。 */
  onOpenSourceEvent: () => void;
}

function containerStyle(isActive: boolean): CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 8,
    border: isActive ? "1px solid rgba(37,99,235,0.45)" : "1px solid rgba(20,40,60,0.08)",
    borderLeft: isActive ? "4px solid #2563eb" : "4px solid rgba(37,99,235,0.25)",
    background: isActive ? "#eff6ff" : "transparent",
    transition: "background 0.15s ease, border-color 0.15s ease",
  };
}

export function InboxAiDraftItem({
  draft, reason, onReasonChange, acting, onApprove, onReject,
  isSelected, onSelectedChange, isActive, isExpanded, onExpandedChange, onOpenSourceEvent,
}: InboxAiDraftItemProps) {
  return (
    <div style={containerStyle(isActive)} data-testid="inbox-ai-draft-item" data-active={isActive || undefined}>
      <Space direction="vertical" size={6} style={{ width: "100%" }}>
        <Space wrap size={6}>
          <Checkbox
            checked={isSelected}
            onChange={(e) => onSelectedChange(e.target.checked)}
            aria-label={`勾选草稿：${draft.summary}`}
          />
          <Text strong style={{ fontSize: 13 }}>{draft.summary}</Text>
          {proposalLevelTag(draft.proposalLevel)}
          {balancedTag(draft.balanced)}
        </Space>
        <Space wrap size={6}>
          <Text type="secondary" style={{ fontSize: 11 }}>
            事项 {draft.businessEventId} · 凭证类型 {draft.voucherType}
          </Text>
          <Button
            type="link" size="small" icon={<LinkOutlined />}
            style={{ fontSize: 11, padding: 0, height: "auto" }}
            onClick={onOpenSourceEvent}
          >
            来源事项
          </Button>
        </Space>

        <Collapse
          ghost
          size="small"
          activeKey={isExpanded ? ["lines"] : []}
          onChange={(keys) => onExpandedChange(keys.length > 0)}
          items={[{
            key: "lines",
            label: (
              <Space size={8} wrap>
                <span>{`查看分录明细（${draft.lines.length} 条）`}</span>
                <DraftTotalsCheck lines={draft.lines} />
              </Space>
            ),
            children: (
              <Table
                dataSource={draft.lines}
                columns={LINE_COLUMNS}
                rowKey={(_row, idx) => `${draft.id}-${idx}`}
                size="small"
                pagination={false}
              />
            ),
          }]}
        />

        <Space size={8}>
          <Button
            size="small" type="primary" icon={<CheckOutlined />}
            loading={acting === "approve"} disabled={acting === "reject"}
            onClick={onApprove}
          >
            批准
          </Button>
          <Popconfirm
            title="驳回该草稿？"
            description={
              <Input.TextArea
                rows={2}
                style={{ width: 220 }}
                placeholder="驳回原因（可选）"
                value={reason}
                onChange={(e) => onReasonChange(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            }
            okText="确认驳回"
            cancelText="取消"
            onConfirm={onReject}
          >
            <Button size="small" danger icon={<CloseOutlined />} loading={acting === "reject"} disabled={acting === "approve"}>
              驳回
            </Button>
          </Popconfirm>
        </Space>
      </Space>
    </div>
  );
}
