/**
 * Webhook 订阅注册：event_type + target_url → 一次性展示 secret。
 */
import { useState } from "react";
import { Card, Space, Alert, Typography, Input, Select, Button } from "antd";
import { ApiOutlined, LinkOutlined } from "@ant-design/icons";
import { toast } from "sonner";
import { registerWebhook } from "../../../lib/api";
import { SecretRevealModal } from "./SecretRevealModal";

const { Text } = Typography;

const WEBHOOK_EVENT_OPTIONS = [
  { value: "voucher.posted", label: "voucher.posted — 凭证已过账" },
  { value: "risk.triggered", label: "risk.triggered — 风险规则触发" },
  { value: "contract.expiring", label: "contract.expiring — 合同即将到期" },
];

export function WebhookSection() {
  const [eventType, setEventType] = useState("voucher.posted");
  const [targetUrl, setTargetUrl] = useState("");
  const [registering, setRegistering] = useState(false);
  const [revealSecret, setRevealSecret] = useState<string | null>(null);
  const [lastRegistered, setLastRegistered] = useState<{ eventType: string; targetUrl: string } | null>(null);

  async function handleRegister() {
    if (!targetUrl.trim()) {
      toast.error("请输入目标 URL");
      return;
    }
    setRegistering(true);
    try {
      const res = await registerWebhook({ event_type: eventType, target_url: targetUrl.trim() });
      setLastRegistered({ eventType: res.eventType, targetUrl: res.targetUrl });
      setRevealSecret(res.secret);
      setTargetUrl("");
      toast.success("Webhook 已注册");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRegistering(false);
    }
  }

  return (
    <Card
      title={<Space><ApiOutlined style={{ color: "#2563eb" }} /><Text strong>Webhook 订阅</Text></Space>}
      style={{ borderRadius: 10 }}
    >
      <Text type="secondary" style={{ fontSize: 12 }}>
        注册后，指定事件发生时系统会向目标 URL 发送带签名的 POST 通知。
      </Text>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginTop: 14 }}>
        <div style={{ minWidth: 260 }}>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>事件类型</div>
          <Select
            value={eventType}
            onChange={setEventType}
            options={WEBHOOK_EVENT_OPTIONS}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>目标 URL</div>
          <Input
            prefix={<LinkOutlined style={{ color: "#94a3b8" }} />}
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="https://your-server.example.com/webhooks/ft"
          />
        </div>
        <Button type="primary" loading={registering} onClick={() => void handleRegister()}>
          注册
        </Button>
      </div>

      {lastRegistered && (
        <Alert
          type="success"
          showIcon
          style={{ marginTop: 14 }}
          message={`已订阅 ${lastRegistered.eventType} → ${lastRegistered.targetUrl}`}
        />
      )}

      <SecretRevealModal
        open={revealSecret !== null}
        title="Webhook Secret 已生成"
        secret={revealSecret ?? ""}
        onClose={() => setRevealSecret(null)}
      />
    </Card>
  );
}
