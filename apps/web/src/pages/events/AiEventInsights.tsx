/**
 * AI 事项洞察（P6）：对选中经营事项一键获取「分录建议」与「资料体检」。
 */
import { useState } from "react";
import { Card, Button, Space, Table, Tag, Typography, Alert, Progress } from "antd";
import { RobotOutlined, AuditOutlined, FileSearchOutlined } from "@ant-design/icons";
import { toast } from "sonner";
import {
  suggestAccounting, assessCompleteness,
  type AccountingSuggestion, type CompletenessResult,
} from "../../lib/api";

const { Text } = Typography;

export function AiEventInsights({ businessEventId }: { businessEventId: string }) {
  const [acc, setAcc] = useState<AccountingSuggestion | null>(null);
  const [comp, setComp] = useState<CompletenessResult | null>(null);
  const [loadingAcc, setLoadingAcc] = useState(false);
  const [loadingComp, setLoadingComp] = useState(false);

  async function runAcc() {
    setLoadingAcc(true);
    try { setAcc(await suggestAccounting(businessEventId)); }
    catch (err) { toast.error((err as Error).message); }
    finally { setLoadingAcc(false); }
  }
  async function runComp() {
    setLoadingComp(true);
    try { setComp(await assessCompleteness(businessEventId)); }
    catch (err) { toast.error((err as Error).message); }
    finally { setLoadingComp(false); }
  }

  return (
    <Card size="small" style={{ marginBottom: 16, borderRadius: 10, borderLeft: "3px solid #7c3aed" }}
      title={<Space><RobotOutlined style={{ color: "#7c3aed" }} /><Text strong>AI 财税洞察</Text></Space>}>
      <Space wrap style={{ marginBottom: 8 }}>
        <Button size="small" icon={<AuditOutlined />} loading={loadingAcc} onClick={() => void runAcc()}>AI 分录建议</Button>
        <Button size="small" icon={<FileSearchOutlined />} loading={loadingComp} onClick={() => void runComp()}>资料体检</Button>
      </Space>

      {acc && (
        <div style={{ marginBottom: 10 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>{acc.rationale}</Text>
          {acc.lines.length > 0 && (
            <Table size="small" rowKey="id" pagination={false} style={{ marginTop: 6 }}
              dataSource={acc.lines}
              columns={[
                { title: "摘要", dataIndex: "summary" },
                { title: "科目", render: (_, r) => `${r.accountCode} ${r.accountName}` },
                { title: "借", dataIndex: "debit", align: "right" },
                { title: "贷", dataIndex: "credit", align: "right" },
              ]} />
          )}
          <Tag color="purple" style={{ marginTop: 6 }}>置信度 {(acc.confidence * 100).toFixed(0)}%</Tag>
          {acc.needsReview && <Tag color="orange">需人工复核</Tag>}
        </div>
      )}

      {comp && (
        <div>
          <Space align="center" style={{ marginBottom: 6 }}>
            <Text style={{ fontSize: 12 }}>资料完整度</Text>
            <Progress percent={Math.round(comp.score * 100)} size="small" style={{ width: 120 }}
              status={comp.blocked ? "exception" : "success"} />
          </Space>
          <Alert type={comp.blocked ? "warning" : "success"} showIcon style={{ fontSize: 12 }}
            message={comp.recommendation} />
        </div>
      )}
    </Card>
  );
}
