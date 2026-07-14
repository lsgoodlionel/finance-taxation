/**
 * 收件箱 · 单条 AI 草稿行
 * 从 InboxAiDraftsCard 拆出，展示单条草稿的摘要/分级/分录明细与批准驳回操作。
 */
import { Button, Collapse, Input, Popconfirm, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { CheckOutlined, CloseOutlined } from "@ant-design/icons";
import type { CloseDraft, CloseDraftLine } from "../../lib/api";

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

function formatYuan(v: number): string {
  return v > 0 ? `¥${v.toFixed(2)}` : "—";
}

const LINE_COLUMNS: ColumnsType<CloseDraftLine> = [
  { title: "摘要", dataIndex: "summary", key: "summary" },
  { title: "科目", key: "account", render: (_v, line) => `${line.accountCode} ${line.accountName}` },
  { title: "借方", dataIndex: "debit", key: "debit", align: "right", render: formatYuan },
  { title: "贷方", dataIndex: "credit", key: "credit", align: "right", render: formatYuan },
];

interface InboxAiDraftItemProps {
  draft: CloseDraft;
  reason: string;
  onReasonChange: (value: string) => void;
  acting: "approve" | "reject" | null;
  onApprove: () => void;
  onReject: () => void;
}

export function InboxAiDraftItem({ draft, reason, onReasonChange, acting, onApprove, onReject }: InboxAiDraftItemProps) {
  return (
    <div
      style={{
        padding: "10px 12px", borderRadius: 8, border: "1px solid rgba(20,40,60,0.08)",
        borderLeft: "3px solid #2563eb",
      }}
    >
      <Space direction="vertical" size={6} style={{ width: "100%" }}>
        <Space wrap size={6}>
          <Text strong style={{ fontSize: 13 }}>{draft.summary}</Text>
          {proposalLevelTag(draft.proposalLevel)}
          {balancedTag(draft.balanced)}
        </Space>
        <Text type="secondary" style={{ fontSize: 11 }}>
          事项 {draft.businessEventId} · 凭证类型 {draft.voucherType}
        </Text>

        <Collapse
          ghost
          size="small"
          items={[{
            key: "lines",
            label: `查看分录明细（${draft.lines.length} 条）`,
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
