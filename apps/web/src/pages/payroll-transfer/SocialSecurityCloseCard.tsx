import { Alert, Button, Card, Input, Popconfirm, Space, Typography } from "antd";
import { SafetyCertificateOutlined } from "@ant-design/icons";

const { Text } = Typography;

export interface SocialSecurityCloseCardProps {
  ssPeriod: string;
  busy: boolean;
  ssResult: string | null;
  onSsPeriodChange: (value: string) => void;
  onClose: () => Promise<void>;
}

export function SocialSecurityCloseCard({
  ssPeriod,
  busy,
  ssResult,
  onSsPeriodChange,
  onClose
}: SocialSecurityCloseCardProps) {
  return (
    <Card size="small" title={<Space><SafetyCertificateOutlined style={{ color: "#7c3aed" }} />社保关账（三险一金凭证自动化）</Space>}>
      <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 12 }}>
        对已全部确认的工资期间关账，自动生成社保申报事项/任务 + 计提与缴纳凭证草稿。
      </Text>
      <Space.Compact style={{ width: "100%" }}>
        <Input addonBefore="期间" value={ssPeriod} onChange={e => onSsPeriodChange(e.target.value)} placeholder="YYYY-MM" />
        <Popconfirm title={`确认对 ${ssPeriod} 关账并生成三险一金凭证？`} onConfirm={() => void onClose()}>
          <Button type="primary" loading={busy} icon={<SafetyCertificateOutlined />}>社保关账</Button>
        </Popconfirm>
      </Space.Compact>
      {ssResult && (
        <Alert style={{ marginTop: 12 }} type={ssResult.startsWith("✅") ? "success" : "error"} message={ssResult} />
      )}
    </Card>
  );
}
