/**
 * 开放 API 设置面板（F6）
 * 嵌入 SettingsPage「开放 API」Tab
 *
 * 组合 API Key 管理与 Webhook 订阅两个子区块（见 ./open-api/）。
 */
import { Space } from "antd";
import { ApiKeySection } from "./open-api/ApiKeySection";
import { WebhookSection } from "./open-api/WebhookSection";

export function OpenApiSettingsTab() {
  return (
    <Space direction="vertical" size={20} style={{ width: "100%" }}>
      <ApiKeySection />
      <WebhookSection />
    </Space>
  );
}
