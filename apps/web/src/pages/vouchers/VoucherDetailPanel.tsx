import { Button, Space, Tag, Typography, Descriptions, Divider, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  CheckOutlined, AuditOutlined, PrinterOutlined, EditOutlined, SafetyCertificateOutlined,
} from "@ant-design/icons";
import type { VoucherDetail, VoucherTemplate } from "../../lib/api";
import { VOUCHER_STATUS_LABELS, VOUCHER_TYPE_LABELS, useI18n } from "../../lib/i18n";
import { BalanceIndicator } from "./BalanceIndicator";

const { Text, Title } = Typography;

interface VoucherLine {
  id: string;
  summary?: string;
  accountCode: string;
  accountName: string;
  debit: string | number;
  credit: string | number;
}

interface VoucherDetailPanelProps {
  detail: VoucherDetail | null;
  validation: { valid: boolean; totals: { debit: string; credit: string }; issues: string[] } | null;
  updating: boolean;
  onValidate: () => Promise<void>;
  onApprove: () => Promise<void>;
  onPost: () => Promise<void>;
  onSummaryUpdate: (summary: string) => Promise<void>;
}

const LINE_COLUMNS: ColumnsType<VoucherLine> = [
  {
    title: "摘要", dataIndex: "summary", key: "summary",
    render: (_: string, record, _idx) => <Text style={{ fontSize: 12 }}>{record.summary || "—"}</Text>,
  },
  { title: "科目编码", dataIndex: "accountCode", key: "code", width: 100,
    render: (v: string) => <Text type="secondary" style={{ fontSize: 12 }}>{v}</Text> },
  { title: "会计科目", dataIndex: "accountName", key: "name", width: 140,
    render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text> },
  {
    title: "借方", dataIndex: "debit", key: "debit", width: 110, align: "right",
    render: (v: string | number) => Number(v) > 0
      ? <Text strong style={{ fontSize: 12, color: "#2563eb", fontFamily: "monospace" }}>{Number(v).toFixed(2)}</Text>
      : <Text type="secondary">—</Text>,
  },
  {
    title: "贷方", dataIndex: "credit", key: "credit", width: 110, align: "right",
    render: (v: string | number) => Number(v) > 0
      ? <Text strong style={{ fontSize: 12, color: "#7c3aed", fontFamily: "monospace" }}>{Number(v).toFixed(2)}</Text>
      : <Text type="secondary">—</Text>,
  },
];

export function VoucherDetailPanel({
  detail, validation, updating, onValidate, onApprove, onPost, onSummaryUpdate,
}: VoucherDetailPanelProps) {
  const { t } = useI18n();

  if (!detail) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8" }}>
        <SafetyCertificateOutlined style={{ fontSize: 32, marginBottom: 12 }} />
        <div>请选择一张凭证查看详情</div>
      </div>
    );
  }

  const totalDebit  = detail.lines.reduce((s, l) => s + Number(l.debit), 0);
  const totalCredit = detail.lines.reduce((s, l) => s + Number(l.credit), 0);
  const isPosted    = detail.status === "posted";

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <Title level={5} style={{ margin: 0 }}>记账凭证</Title>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {detail.id.slice(-8).toUpperCase()} · {detail.createdAt?.slice(0, 10)}
          </Text>
        </div>
        <Tag color={
          detail.status === "posted"           ? "success" :
          detail.status === "review_required"  ? "warning" : "default"
        }>
          {t(VOUCHER_STATUS_LABELS, detail.status)}
        </Tag>
      </div>

      {/* Meta */}
      <Descriptions size="small" column={2} bordered>
        <Descriptions.Item label="凭证类型">{t(VOUCHER_TYPE_LABELS, detail.voucherType)}</Descriptions.Item>
        <Descriptions.Item label="关联事项">
          <Text copyable style={{ fontSize: 12 }}>{detail.businessEventId || "—"}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="摘要" span={2}>
          {!isPosted ? (
            <Text
              editable={{
                tooltip: "点击编辑摘要",
                onChange: (v) => void onSummaryUpdate(v),
              }}
              style={{ fontSize: 13 }}
            >
              {detail.summary}
            </Text>
          ) : (
            <Text style={{ fontSize: 13 }}>{detail.summary}</Text>
          )}
        </Descriptions.Item>
        {detail.approvedAt && (
          <Descriptions.Item label="审核日期">{detail.approvedAt.slice(0, 10)}</Descriptions.Item>
        )}
        {detail.postedAt && (
          <Descriptions.Item label="过账日期">{detail.postedAt.slice(0, 10)}</Descriptions.Item>
        )}
      </Descriptions>

      {/* Validation result */}
      {validation && <BalanceIndicator result={validation} />}

      {/* Action buttons */}
      {!isPosted && (
        <Space size={8} wrap>
          <Button
            size="small"
            icon={<AuditOutlined />}
            loading={updating}
            onClick={() => void onValidate()}
          >
            借贷校验
          </Button>
          {detail.status === "draft" && (
            <Button
              size="small"
              type="primary"
              ghost
              icon={<CheckOutlined />}
              loading={updating}
              onClick={() => void onApprove()}
            >
              审核通过
            </Button>
          )}
          {detail.status === "review_required" && (
            <Button
              size="small"
              type="primary"
              icon={<EditOutlined />}
              loading={updating}
              onClick={() => void onPost()}
            >
              过账
            </Button>
          )}
          <Button size="small" icon={<PrinterOutlined />} disabled>打印预览</Button>
        </Space>
      )}

      <Divider style={{ margin: "4px 0" }} />

      {/* Journal lines */}
      <Table
        dataSource={detail.lines as VoucherLine[]}
        columns={LINE_COLUMNS}
        rowKey="id"
        size="small"
        pagination={false}
        summary={() => (
          <Table.Summary.Row style={{ background: "#f8fafc", fontWeight: 600 }}>
            <Table.Summary.Cell index={0} colSpan={3}>
              <Text strong style={{ fontSize: 12 }}>合　计</Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={3} align="right">
              <Text strong style={{ fontFamily: "monospace", fontSize: 12, color: "#2563eb" }}>
                {totalDebit.toFixed(2)}
              </Text>
            </Table.Summary.Cell>
            <Table.Summary.Cell index={4} align="right">
              <Text strong style={{ fontFamily: "monospace", fontSize: 12, color: "#7c3aed" }}>
                {totalCredit.toFixed(2)}
              </Text>
            </Table.Summary.Cell>
          </Table.Summary.Row>
        )}
      />

      {/* Footer */}
      {detail.postingRecords.length > 0 && (
        <div style={{ display: "flex", gap: 24, fontSize: 12, color: "#64748b", paddingTop: 8, borderTop: "1px solid #f0f0f0" }}>
          <span>制单：{detail.postingRecords[0]?.postedByName ?? "—"}</span>
          {detail.approvedAt && <span>审核：{detail.approvedAt.slice(0, 10)}</span>}
          {detail.postedAt   && <span>过账：{detail.postedAt.slice(0, 10)}</span>}
        </div>
      )}
    </Space>
  );
}
