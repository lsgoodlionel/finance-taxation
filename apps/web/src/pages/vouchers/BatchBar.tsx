import { Button, Progress, Space, Typography } from "antd";
import { AuditOutlined, SendOutlined } from "@ant-design/icons";
import type { VoucherBatchProgress } from "./useVoucherBatch";

const { Text } = Typography;

interface BatchBarProps {
  checkedCount: number;
  approvableCount: number;
  postableCount: number;
  running: boolean;
  progress: VoucherBatchProgress | null;
  onBatchApprove: () => void;
  onBatchPost: () => void;
  onClear: () => void;
}

/**
 * V7 L2 批量操作条：显示勾选数量、可审核/可过账数量与批量进度（n/m）。
 */
export function BatchBar({
  checkedCount,
  approvableCount,
  postableCount,
  running,
  progress,
  onBatchApprove,
  onBatchPost,
  onClear,
}: BatchBarProps) {
  if (checkedCount === 0 && !running) return null;

  const percent = progress && progress.total > 0
    ? Math.round((progress.done / progress.total) * 100)
    : 0;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
        borderRadius: 10,
        border: "1px solid rgba(37,99,235,0.24)",
        background: "rgba(37,99,235,0.06)",
        padding: "8px 12px",
      }}
    >
      <Space size={12} wrap>
        <Text strong style={{ fontSize: 13 }}>已选 {checkedCount} 张凭证</Text>
        <Button
          size="small"
          icon={<AuditOutlined />}
          disabled={running || approvableCount === 0}
          onClick={onBatchApprove}
        >
          批量审核（{approvableCount} 张草稿）
        </Button>
        <Button
          size="small"
          type="primary"
          icon={<SendOutlined />}
          disabled={running || postableCount === 0}
          onClick={onBatchPost}
        >
          批量过账（{postableCount} 张已审核）
        </Button>
        <Button size="small" disabled={running} onClick={onClear}>取消选择</Button>
      </Space>
      {progress && (
        <Space size={8}>
          <Text style={{ fontSize: 12, color: "#2563eb" }}>
            {progress.label}中 {progress.done}/{progress.total}
          </Text>
          <Progress percent={percent} size="small" style={{ width: 120, margin: 0 }} showInfo={false} />
        </Space>
      )}
    </div>
  );
}
