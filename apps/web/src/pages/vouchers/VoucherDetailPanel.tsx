// 显式 import React：本仓的 web 测试用 `node --import tsx` 直接跑组件做服务端渲染，
// 那条路径下 JSX 走的是 classic transform，缺了它会在渲染时报 React is not defined。
import React from "react";
import { Button, Popconfirm, Space, Tag, Typography, Descriptions, Divider, Table } from "antd";
import type { WorkflowRunDetail } from "../../lib/api";
import type { ColumnsType } from "antd/es/table";
import {
  CheckOutlined, AuditOutlined, PrinterOutlined, EditOutlined, RollbackOutlined, SafetyCertificateOutlined,
} from "@ant-design/icons";
import type { VoucherDetail, VoucherTemplate } from "../../lib/api";
import { VOUCHER_STATUS_LABELS, VOUCHER_TYPE_LABELS, useI18n } from "../../lib/i18n";
import { ValidationHintPanel } from "./ValidationHintPanel";
import { EntityLink } from "../../components/ui/EntityLink";
import { Term } from "../../components/ui/Term";

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
  runtimeDetail?: WorkflowRunDetail | null;
  validation: { valid: boolean; totals: { debit: string; credit: string }; issues: string[] } | null;
  updating: boolean;
  onValidate: () => Promise<void>;
  onApprove: () => Promise<void>;
  /**
   * 过账。
   *
   * 返回 `void` 而不是 `Promise<void>`：它内部弹一个需要选终审人的确认框，
   * 真正的过账发生在用户点「确认」之后。让它返回 Promise 会诱使调用方 `await`，
   * 而那个 Promise 在对话框弹出时就已经 resolve 了——等于什么都没等到。
   */
  onPost: () => void;
  /**
   * 红冲已过账的凭证。
   *
   * 手册和页面指南一直写着「过错了用红冲」「红冲按钮点了报…」，
   * 而这个按钮在前台**根本不存在**——后端 `POST /api/vouchers/:id/reverse`
   * 从 V12 起就在，只是没人接上来。
   */
  onReverse: () => Promise<void>;
  onSummaryUpdate: (summary: string) => Promise<void>;
  onOpenEvent?: (businessEventId: string) => void;
  onOpenDocuments?: (businessEventId: string) => void;
  onOpenTax?: (businessEventId: string) => void;
  onOpenLedger?: (voucherId: string, businessEventId: string) => void;
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
  detail,
  runtimeDetail,
  validation,
  updating,
  onValidate,
  onApprove,
  onPost,
  onReverse,
  onSummaryUpdate,
  onOpenEvent,
  onOpenDocuments,
  onOpenTax,
  onOpenLedger
}: VoucherDetailPanelProps) {
  const { t } = useI18n();

  if (!detail) {
    return (
      <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8" }}>
        <SafetyCertificateOutlined style={{ fontSize: 32, marginBottom: 12 }} />
        <div>请选择一张<Term k="voucher">凭证</Term>查看详情</div>
      </div>
    );
  }

  const totalDebit  = detail.lines.reduce((s, l) => s + Number(l.debit), 0);
  const totalCredit = detail.lines.reduce((s, l) => s + Number(l.credit), 0);
  const isPosted    = detail.status === "posted";
  const latestCommand = runtimeDetail?.commands[0] ?? null;

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
          <span style={{ fontSize: 12 }}>
            <EntityLink kind="business_event" id={detail.businessEventId} />
          </span>
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

      {runtimeDetail?.run.blockedReason ? (
        <div style={{ borderRadius: 10, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.16)", padding: "10px 12px", color: "#991b1b", fontSize: 12 }}>
          阻塞原因：{runtimeDetail.run.blockedReason}
        </div>
      ) : null}
      {latestCommand?.lastErrorDetail || runtimeDetail?.compensations.length ? (
        <div style={{ borderRadius: 10, background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.18)", padding: "10px 12px", fontSize: 12, color: "#92400e" }}>
          <div>运行提示：{latestCommand?.lastErrorDetail || "已存在人工补偿记录"}</div>
          <div style={{ marginTop: 4 }}>
            补偿记录：{runtimeDetail?.compensations.length ?? 0} 条
          </div>
        </div>
      ) : null}
      <Space wrap size={8}>
        <Button size="small" onClick={() => onOpenEvent?.(detail.businessEventId)}>
          查看事项
        </Button>
        <Button size="small" onClick={() => onOpenDocuments?.(detail.businessEventId)}>
          查看单据
        </Button>
        <Button size="small" onClick={() => onOpenTax?.(detail.businessEventId)}>
          查看税务
        </Button>
        <Button size="small" onClick={() => onOpenLedger?.(detail.id, detail.businessEventId)}>
          查看总账
        </Button>
      </Space>

      {/* Validation result with repair hints */}
      {validation && <ValidationHintPanel result={validation} lines={detail.lines} />}

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
          {/*
            「复核过没有」的判据是 **approvedAt**，不是 status。

            事项分析生成的凭证落库即 `review_required` 但 `approvedAt` 为 null——
            按 status 判，它既拿不到「审核通过」（那只给 draft），
            点「过账」又必然 400（服务端要求 approvedAt 非空）。
            这类凭证在界面上**无路可走**，实验时库里卡了 5 张。

            status 是粗粒度标记，approvedAt 才是「有没有人复核过」的事实。
          */}
          {!detail.approvedAt && (
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
          {detail.approvedAt && (
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

      {/*
        已过账凭证的动作区。

        **必须和上面那块并列，不能嵌在 `!isPosted` 里面**——红冲第一版就是嵌进去的，
        `!isPosted && status === "posted"` 恒假，按钮从来没渲染出来过。
        tsc 干净、测试全绿、护栏也绿（前端源码里确实出现了 reverseVoucher 这个符号），
        只有真的打开页面看才发现它不在。
      */}
      {isPosted && (
        <Space size={8} wrap>
          <Popconfirm
            title="红冲这张凭证？"
            description="会生成一张方向相反的红冲凭证（草稿），复核过账后原分录才被冲平。原凭证不会被改动。"
            okText="生成红冲凭证"
            cancelText="取消"
            onConfirm={() => void onReverse()}
          >
            <Button size="small" danger icon={<RollbackOutlined />} loading={updating}>
              红冲
            </Button>
          </Popconfirm>
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
          {detail.postedAt   && <span><Term k="posting">过账</Term>：{detail.postedAt.slice(0, 10)}</span>}
        </div>
      )}
    </Space>
  );
}
