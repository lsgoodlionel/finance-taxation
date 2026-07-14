/**
 * 收件箱 · AI 草稿卡片（占位）
 * Stage H 将在此填充 AI 生成的可一键确认草稿（分录建议、申报草稿等）。
 * 本阶段仅提供预留区块，不发起任何数据请求。
 */
import { Space, Tag, Typography } from "antd";
import { RobotOutlined } from "@ant-design/icons";

const { Text } = Typography;

export function InboxAiDraftsCard() {
  return (
    <section className="v3-section-shell" data-tone="muted" data-testid="inbox-ai-drafts">
      <Space style={{ justifyContent: "space-between", width: "100%" }}>
        <Space size={8}>
          <Text strong>🤖 AI 草稿</Text>
          <Tag color="processing">即将上线 · Stage H</Tag>
        </Space>
      </Space>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 12, marginTop: 10,
          padding: "16px 14px", borderRadius: 10, border: "1px dashed rgba(20,40,60,0.16)",
          background: "rgba(37,99,235,0.04)",
        }}
      >
        <RobotOutlined style={{ fontSize: 24, color: "#94a3b8" }} />
        <Space direction="vertical" size={2}>
          <Text>AI 将在此生成可一键确认/驳回的草稿（分录建议、申报草稿等）</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            下一步建议：功能在 Stage H 上线后，草稿会自动出现在这里，无需手动查找。
          </Text>
        </Space>
      </div>
    </section>
  );
}
