import { Alert, Button, Card, Popconfirm, Space, Table, Tag, Typography } from "antd";
import { CheckCircleOutlined, DownloadOutlined, FileDoneOutlined } from "@ant-design/icons";
import type { AuditLog } from "@finance-taxation/domain-model";
import type { PayrollTransferLine } from "../../lib/api";
import { STATUS_TAG } from "./transfer-status";
import type { TransferBatchSelection } from "./useTransferBatchWorkflow";

const { Text } = Typography;

export interface TransferBatchDetailCardProps {
  selected: TransferBatchSelection;
  busy: boolean;
  batchAuditLogs: AuditLog[];
  onApprove: () => Promise<void>;
  onDownload: (format: "generic" | "cmb") => Promise<void>;
  onDisburse: () => Promise<void>;
  onCompensate: () => Promise<void>;
}

export function TransferBatchDetailCard({
  selected,
  busy,
  batchAuditLogs,
  onApprove,
  onDownload,
  onDisburse,
  onCompensate
}: TransferBatchDetailCardProps) {
  const st = selected.batch.status;

  return (
    <Card size="small" title={<Space><FileDoneOutlined />{selected.batch.payroll_period} 代发批次 <Tag color={STATUS_TAG[st!]?.color}>{STATUS_TAG[st!]?.label}</Tag></Space>}
      extra={selected.batch.bank_transfer_ref && <Text type="secondary" style={{ fontSize: 12 }}>批次号 {selected.batch.bank_transfer_ref}</Text>}>
      {selected.batch.last_error ? (
        <Alert
          style={{ marginBottom: 12 }}
          type={selected.batch.compensation_status === "failed" ? "error" : "warning"}
          showIcon
          message={`运行备注：${selected.batch.last_error}`}
          description={
            selected.batch.next_retry_at
              ? `下次建议重试时间：${new Date(selected.batch.next_retry_at).toLocaleString("zh-CN")}`
              : `已记录 ${selected.batch.retry_count} 次补偿/重试尝试。`
          }
        />
      ) : null}
      {selected.batch.status === "disbursed" && selected.batch.compensation_status !== "completed" ? (
        <Alert
          style={{ marginBottom: 12 }}
          type="warning"
          showIcon
          message="工资代发已完成，但下游经营事项联动未闭环"
          description={`当前补偿状态：${selected.batch.compensation_status}。可执行补偿，补回事项与审计记录。`}
        />
      ) : null}
      <Table<PayrollTransferLine>
        size="small" rowKey="id" dataSource={selected.lines} pagination={false} style={{ marginBottom: 12 }}
        columns={[
          { title: "姓名", dataIndex: "employee_name" },
          { title: "账号", dataIndex: "salary_account", render: (v, r) => r.status === "skipped" ? <Tag color="orange">缺账号</Tag> : <Text style={{ fontSize: 12 }}>{v}</Text> },
          { title: "开户行", dataIndex: "salary_bank" },
          { title: "实发", dataIndex: "amount", align: "right", render: (v) => `¥${Number(v).toFixed(2)}` },
        ]}
      />
      <Space wrap>
        {st === "draft" && <Button type="primary" loading={busy} onClick={() => void onApprove()}>审批</Button>}
        {(st === "approved" || st === "exported" || st === "disbursed") && (
          <>
            <Button icon={<DownloadOutlined />} onClick={() => void onDownload("generic")}>导出通用CSV</Button>
            <Button icon={<DownloadOutlined />} onClick={() => void onDownload("cmb")}>导出招行格式</Button>
          </>
        )}
        {st === "exported" && (
          <Popconfirm title="确认银行已代发完成？将联动生成经营事项" onConfirm={() => void onDisburse()}>
            <Button type="primary" icon={<CheckCircleOutlined />} loading={busy}>标记已代发</Button>
          </Popconfirm>
        )}
        {st === "disbursed" && selected.batch.compensation_status !== "completed" && (
          <Button loading={busy} onClick={() => void onCompensate()}>补偿联动事项</Button>
        )}
      </Space>
      <div style={{ marginTop: 16, borderTop: "1px solid #f0f0f0", paddingTop: 12 }}>
        <Text strong>补偿审计追溯</Text>
        <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280" }}>
          代发批次：{selected.batch.id}
          {selected.batch.compensation_event_id ? `；经营事项：${selected.batch.compensation_event_id}` : "；经营事项待补偿"}
        </div>
        {batchAuditLogs.length > 0 ? (
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {batchAuditLogs.map((log) => {
              const changes = log.changes && typeof log.changes === "object"
                ? (log.changes as Record<string, unknown>)
                : null;
              const linkedEventId = typeof changes?.eventId === "string" ? changes.eventId : null;
              const bankTransferRef = typeof changes?.bankTransferRef === "string" ? changes.bankTransferRef : null;
              return (
                <div
                  key={log.id}
                  style={{
                    border: "1px solid #f0f0f0",
                    borderRadius: 8,
                    padding: "8px 10px",
                    background: "#fafafa"
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{log.action}</div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                    {new Date(log.createdAt).toLocaleString("zh-CN")}
                    {log.userName ? ` · ${log.userName}` : " · 系统"}
                  </div>
                  {linkedEventId || bankTransferRef ? (
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                      {[linkedEventId ? `经营事项 ${linkedEventId}` : null, bankTransferRef ? `银行批次号 ${bankTransferRef}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <Alert style={{ marginTop: 10 }} type="info" showIcon message="当前批次暂无可展示的审计记录。" />
        )}
      </div>
    </Card>
  );
}
