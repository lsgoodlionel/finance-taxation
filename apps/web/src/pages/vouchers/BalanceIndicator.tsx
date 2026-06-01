import { Alert, Space, Typography } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons";

const { Text } = Typography;

interface BalanceResult {
  valid: boolean;
  totals: { debit: string; credit: string };
  issues: string[];
}

interface BalanceIndicatorProps {
  result: BalanceResult;
}

export function BalanceIndicator({ result }: BalanceIndicatorProps) {
  const debit  = parseFloat(result.totals.debit)  || 0;
  const credit = parseFloat(result.totals.credit) || 0;
  const diff   = Math.abs(debit - credit);

  return (
    <Alert
      type={result.valid ? "success" : "error"}
      icon={result.valid ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
      showIcon
      style={{ borderRadius: 8 }}
      message={
        <Space size={16}>
          <span>
            {result.valid ? "借贷平衡" : "借贷不平衡"}
          </span>
          <Text style={{ fontSize: 12 }}>
            借方合计 <Text strong>¥{debit.toFixed(2)}</Text>
            {"　"}
            贷方合计 <Text strong>¥{credit.toFixed(2)}</Text>
            {!result.valid && diff > 0 && (
              <Text type="danger">{"　"}差额 ¥{diff.toFixed(2)}</Text>
            )}
          </Text>
        </Space>
      }
      description={
        result.issues.length > 0 ? (
          <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
            {result.issues.map(issue => <li key={issue} style={{ fontSize: 12 }}>{issue}</li>)}
          </ul>
        ) : undefined
      }
    />
  );
}
