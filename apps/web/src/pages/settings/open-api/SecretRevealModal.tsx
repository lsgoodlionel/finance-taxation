/**
 * 一次性明文密钥展示弹窗（API Key / Webhook Secret 共用）。
 * 复制 + 强警告，关闭后不可再查看，只能重新生成。
 */
import { Button, Alert, Typography, Modal } from "antd";
import { CopyOutlined, ExclamationCircleOutlined } from "@ant-design/icons";
import { toast } from "sonner";

const { Paragraph } = Typography;

interface SecretRevealModalProps {
  open: boolean;
  title: string;
  secret: string;
  onClose: () => void;
}

export function SecretRevealModal({ open, title, secret, onClose }: SecretRevealModalProps) {
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(secret);
      toast.success("已复制到剪贴板");
    } catch {
      toast.error("复制失败，请手动选中复制");
    }
  }

  return (
    <Modal
      open={open}
      title={title}
      onCancel={onClose}
      footer={[
        <Button key="copy" icon={<CopyOutlined />} onClick={() => void handleCopy()}>
          复制
        </Button>,
        <Button key="close" type="primary" onClick={onClose}>
          我已保存，关闭
        </Button>,
      ]}
      maskClosable={false}
      closable={false}
    >
      <Alert
        type="warning"
        showIcon
        icon={<ExclamationCircleOutlined />}
        message="仅显示一次，请妥善保存"
        description="关闭本弹窗后将无法再次查看完整密钥，只能重新生成。"
        style={{ marginBottom: 16 }}
      />
      <Paragraph
        copyable={false}
        style={{
          fontFamily: "monospace", fontSize: 13, padding: "10px 12px",
          background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8,
          wordBreak: "break-all", userSelect: "all",
        }}
      >
        {secret}
      </Paragraph>
    </Modal>
  );
}
