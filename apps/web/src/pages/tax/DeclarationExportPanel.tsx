/**
 * 申报文件导出面板
 * 嵌入 TaxPage，在 TaxBatchesPanel 下方展示
 * 提供 VAT XML / IIT CSV / 社保 CSV / 公积金 CSV 四个一键下载按钮
 * 展示历史申报提交记录
 */
import { useState, useEffect, useCallback } from "react";
import {
  Card, Button, Space, Table, Tag, Select, Typography, Alert, Row, Col, Statistic,
  Modal, Input, Tooltip,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  DownloadOutlined, CheckCircleOutlined, ClockCircleOutlined,
  FileTextOutlined, FileSyncOutlined,
} from "@ant-design/icons";
import { toast } from "sonner";
import {
  downloadDeclarationFile, listDeclarationSubmissions, confirmDeclarationSubmission,
  type DeclarationSubmission,
} from "../../lib/api";

const { Text } = Typography;

const TAX_TYPE_LABELS: Record<string, string> = {
  vat: "增值税", iit: "个人所得税", si: "社保费", housing_fund: "住房公积金", cit: "企业所得税",
};

const STATUS_COLOR: Record<string, string> = {
  generated: "default", uploaded: "processing", confirmed: "success", rejected: "error",
};
const STATUS_LABELS: Record<string, string> = {
  generated: "已生成", uploaded: "已上传", confirmed: "已确认", rejected: "被退回",
};

interface DeclarationExportPanelProps {
  currentPeriod?: string;
}

export function DeclarationExportPanel({ currentPeriod }: DeclarationExportPanelProps) {
  const period = currentPeriod ?? new Date().toISOString().slice(0, 7);
  const [submissions, setSubmissions] = useState<DeclarationSubmission[]>([]);
  const [loadingType, setLoadingType] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmRef, setConfirmRef] = useState("");
  const [confirming, setConfirming] = useState(false);

  const loadSubmissions = useCallback(async () => {
    try {
      const data = await listDeclarationSubmissions(period);
      setSubmissions(data.items);
    } catch {
      // silent — submissions are optional context
    }
  }, [period]);

  useEffect(() => { void loadSubmissions(); }, [loadSubmissions]);

  async function handleDownload(type: "vat-xml" | "iit-csv" | "si-csv" | "fund-csv", label: string) {
    setLoadingType(type);
    try {
      const { blobUrl, fileName } = await downloadDeclarationFile(type, period);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(blobUrl);
      toast.success(`${label} 已下载，请上传至电子税务局`);
      await loadSubmissions();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoadingType(null);
    }
  }

  async function handleConfirm() {
    if (!confirmId) return;
    setConfirming(true);
    try {
      await confirmDeclarationSubmission(confirmId, confirmRef || undefined);
      toast.success("申报记录已确认");
      setConfirmId(null);
      setConfirmRef("");
      await loadSubmissions();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setConfirming(false);
    }
  }

  const generatedCount = submissions.filter(s => s.status === "generated").length;
  const confirmedCount = submissions.filter(s => s.status === "confirmed").length;

  const columns: ColumnsType<DeclarationSubmission> = [
    {
      title: "税种", dataIndex: "taxType", key: "taxType", width: 100,
      render: (v: string) => TAX_TYPE_LABELS[v] ?? v,
    },
    {
      title: "文件名", dataIndex: "fileName", key: "fileName",
      render: (v: string) => <Text style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: "状态", dataIndex: "status", key: "status", width: 90,
      render: (v: string) => (
        <Tag color={STATUS_COLOR[v] ?? "default"} style={{ fontSize: 11 }}>
          {STATUS_LABELS[v] ?? v}
        </Tag>
      ),
    },
    {
      title: "申报流水号", dataIndex: "submissionRef", key: "ref", width: 140,
      render: (v: string | null) => v
        ? <Text type="secondary" style={{ fontSize: 11 }}>{v}</Text>
        : <Text type="secondary">—</Text>,
    },
    {
      title: "生成时间", dataIndex: "createdAt", key: "created", width: 110,
      render: (v: string) => <Text style={{ fontSize: 11 }}>{v?.slice(0, 16).replace("T", " ")}</Text>,
    },
    {
      title: "操作", key: "actions", width: 100,
      render: (_, record) => record.status === "generated" ? (
        <Button size="small" type="link" onClick={() => { setConfirmId(record.id); setConfirmRef(""); }}>
          确认已提交
        </Button>
      ) : null,
    },
  ];

  const DOWNLOAD_ITEMS = [
    { type: "vat-xml" as const, label: "增值税申报表 (XML)", icon: <FileTextOutlined />, color: "#2563eb" },
    { type: "iit-csv" as const, label: "个税扣缴申报 (CSV)", icon: <FileSyncOutlined />, color: "#7c3aed" },
    { type: "si-csv"  as const, label: "社保费申报 (CSV)",   icon: <FileSyncOutlined />, color: "#d97706" },
    { type: "fund-csv" as const, label: "住房公积金 (CSV)",  icon: <FileSyncOutlined />, color: "#16a34a" },
  ];

  return (
    <Card
      title={
        <Space>
          <DownloadOutlined style={{ color: "#2563eb" }} />
          <Text strong>申报文件导出</Text>
          <Tag color="blue" style={{ fontSize: 11 }}>{period}</Tag>
        </Space>
      }
      style={{ borderRadius: 12 }}
      styles={{ body: { paddingTop: 12 } }}
    >
      <Alert
        type="info" showIcon style={{ marginBottom: 16, borderRadius: 8 }}
        message="点击下方按钮生成申报文件，下载后请上传至对应系统：增值税/个税/社保 → 电子税务局；公积金 → 当地公积金管理中心系统。"
      />

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {DOWNLOAD_ITEMS.map(item => (
          <Col key={item.type} xs={24} sm={12} lg={6}>
            <Button
              block
              icon={item.icon}
              loading={loadingType === item.type}
              onClick={() => void handleDownload(item.type, item.label)}
              style={{
                borderColor: item.color, color: item.color,
                background: `${item.color}08`,
                height: 44, borderRadius: 8,
              }}
            >
              <span style={{ fontSize: 12 }}>{item.label}</span>
            </Button>
          </Col>
        ))}
      </Row>

      {/* Progress summary */}
      {submissions.length > 0 && (
        <Row gutter={[16, 8]} style={{ marginBottom: 12 }}>
          <Col span={8}>
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 12 }}>已生成未上传</Text>}
              value={generatedCount}
              suffix="份"
              valueStyle={{ fontSize: 18, color: generatedCount > 0 ? "#d97706" : "#64748b" }}
              prefix={<ClockCircleOutlined />}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title={<Text type="secondary" style={{ fontSize: 12 }}>已确认申报</Text>}
              value={confirmedCount}
              suffix="份"
              valueStyle={{ fontSize: 18, color: "#16a34a" }}
              prefix={<CheckCircleOutlined />}
            />
          </Col>
        </Row>
      )}

      {/* Submission history */}
      <Table
        dataSource={submissions}
        columns={columns}
        rowKey="id"
        size="small"
        pagination={{ hideOnSinglePage: true, size: "small", pageSize: 8 }}
        locale={{ emptyText: <Text type="secondary" style={{ fontSize: 12 }}>本期暂无申报记录，生成文件后将自动记录</Text> }}
      />

      {/* Confirm modal */}
      <Modal
        title="确认申报已提交"
        open={!!confirmId}
        onOk={() => void handleConfirm()}
        onCancel={() => { setConfirmId(null); setConfirmRef(""); }}
        okText="确认"
        cancelText="取消"
        confirmLoading={confirming}
      >
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          message="请在电子税务局完成上传并获取申报流水号后填写" />
        <Input
          value={confirmRef}
          onChange={e => setConfirmRef(e.target.value)}
          placeholder="电子税务局申报流水号（可选）"
        />
      </Modal>
    </Card>
  );
}
