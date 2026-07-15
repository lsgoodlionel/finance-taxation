/**
 * 收件箱 · AI 草稿批量操作条
 * 从 InboxAiDraftsCard 拆出：显示「已选 N 条 · 合计金额 X」与批量批准/驳回入口，
 * 批量执行期间展示进度（3/8…）。批准仅生成 draft 凭证，不越权过账。
 */
import { useState, type CSSProperties } from "react";
import { Button, Input, Popconfirm, Progress, Space, Typography } from "antd";
import { CheckOutlined, CloseOutlined } from "@ant-design/icons";
import { formatCny } from "./draft-batch";

const { Text } = Typography;

export interface BatchRunState {
  action: "approve" | "reject";
  done: number;
  total: number;
}

interface InboxDraftBatchBarProps {
  selectedCount: number;
  totalAmount: number;
  running: BatchRunState | null;
  onApproveSelected: () => void;
  onRejectSelected: (reason?: string) => void;
}

const PERCENT_FULL = 100;

export function InboxDraftBatchBar({
  selectedCount, totalAmount, running, onApproveSelected, onRejectSelected,
}: InboxDraftBatchBarProps) {
  const [rejectReason, setRejectReason] = useState("");

  if (running) {
    const percent = running.total > 0
      ? Math.round((running.done / running.total) * PERCENT_FULL)
      : PERCENT_FULL;
    return (
      <div style={barStyle} data-testid="inbox-draft-batch-bar">
        <Space size={10} style={{ width: "100%" }}>
          <Text style={{ fontSize: 12, whiteSpace: "nowrap" }}>
            批量{running.action === "approve" ? "批准" : "驳回"}中 {running.done}/{running.total}…
          </Text>
          <Progress percent={percent} size="small" style={{ flex: 1, minWidth: 120, margin: 0 }} />
        </Space>
      </div>
    );
  }

  if (selectedCount === 0) return null;

  const handleReject = () => {
    onRejectSelected(rejectReason.trim() || undefined);
    setRejectReason("");
  };

  return (
    <div style={barStyle} data-testid="inbox-draft-batch-bar">
      <Space style={{ justifyContent: "space-between", width: "100%", flexWrap: "wrap" }}>
        <Text strong style={{ fontSize: 12 }}>
          已选 {selectedCount} 条 · 合计金额 {formatCny(totalAmount)}
        </Text>
        <Space size={8}>
          <Popconfirm
            title={`批量批准 ${selectedCount} 条草稿？`}
            description="批准仅生成 draft 状态凭证，仍需在凭证中心过账入账。"
            okText="确认批准"
            cancelText="取消"
            onConfirm={onApproveSelected}
          >
            <Button size="small" type="primary" icon={<CheckOutlined />}>批量批准</Button>
          </Popconfirm>
          <Popconfirm
            title={`批量驳回 ${selectedCount} 条草稿？`}
            description={
              <Input.TextArea
                rows={2}
                style={{ width: 220 }}
                placeholder="驳回原因（可选，应用到所有选中项）"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            }
            okText="确认驳回"
            cancelText="取消"
            onConfirm={handleReject}
          >
            <Button size="small" danger icon={<CloseOutlined />}>批量驳回</Button>
          </Popconfirm>
        </Space>
      </Space>
    </div>
  );
}

const barStyle: CSSProperties = {
  marginTop: 10,
  padding: "8px 12px",
  borderRadius: 8,
  background: "#eff6ff",
  border: "1px solid rgba(37,99,235,0.25)",
};
