/**
 * 财税资料包（Phase9-F9）：按会计期间汇总全链路产物，沉淀为可审查、
 * 可留档的「企业财税管理资料」，支持打印/导出。
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Row, Col, Tag, Button, Space, Typography, Progress, Spin, Alert, Result } from "antd";
import { FolderViewOutlined, PrinterOutlined, ReloadOutlined, RightOutlined, LockOutlined } from "@ant-design/icons";
import { toast } from "sonner";
import { PageHeader } from "../components/ui/PageHeader";
import { FinanceFlowBar } from "../components/FinanceFlowBar";
import { usePeriod } from "../lib/period-context";
import { getArchivePackage, type ArchivePackage } from "../lib/api";

const { Text, Title } = Typography;

const STAGE_PATH: Record<string, string> = {
  events: "/events", documents: "/documents", vouchers: "/vouchers", payroll: "/payroll",
  reports: "/reports", tax: "/tax", risk: "/risk", audit: "/audit",
};

export function ArchivePackagePage() {
  const { period } = usePeriod();
  const navigate = useNavigate();
  const [pkg, setPkg] = useState<ArchivePackage | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setPkg(await getArchivePackage(period)); }
    catch (err) { toast.error((err as Error).message); }
    finally { setLoading(false); }
  }, [period]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section className="v3-hero-shell">
        <PageHeader title={`财税资料包 · ${period}`}
          subtitle="按会计期间汇总经营事项→单据→凭证→报表→税务→风险→审计全链路产物，沉淀为可审查、可留档的企业财税管理资料。"
          actions={<Space>
            <Button icon={<PrinterOutlined />} onClick={() => window.print()}>打印 / 导出 PDF</Button>
            <Button icon={<ReloadOutlined />} onClick={() => void load()}>刷新</Button>
          </Space>} />
      </section>

      <FinanceFlowBar current="archive" />

      {loading ? (
        <div style={{ padding: 40, textAlign: "center" }}><Spin /></div>
      ) : !pkg ? (
        <Card><Result status="warning" title="无法生成资料包" /></Card>
      ) : (
        <>
          {/* 资料包封面 */}
          <section className="v3-section-shell" data-tone="accent">
            <Space style={{ justifyContent: "space-between", width: "100%", flexWrap: "wrap" }} align="start">
              <Space direction="vertical" size={2}>
                <Title level={4} style={{ margin: 0 }}>{pkg.company.name || "（未填写公司名称）"}</Title>
                <Text type="secondary" style={{ fontSize: 12 }}>统一社会信用代码：{pkg.company.creditCode || "—"} · 所属期 {pkg.period}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>生成时间 {pkg.generatedAt.slice(0, 19).replace("T", " ")}</Text>
              </Space>
              <Space direction="vertical" align="end">
                <Progress type="circle" size={72} percent={Math.round((pkg.completeCount / pkg.total) * 100)}
                  status={pkg.readyToArchive ? "success" : "active"} />
                {pkg.archived
                  ? <Tag icon={<LockOutlined />} color="success">已归档锁账</Tag>
                  : pkg.readyToArchive ? <Tag color="processing">资料齐全可归档</Tag> : <Tag>整理中 {pkg.completeCount}/{pkg.total}</Tag>}
              </Space>
            </Space>
          </section>

          {!pkg.readyToArchive && (
            <Alert type="info" showIcon
              message={`资料包尚有 ${pkg.total - pkg.completeCount} 个环节待补齐，补齐后即可归档为完整的企业财税管理资料。`} />
          )}

          {/* 章节清单 */}
          <Row gutter={[16, 16]}>
            {pkg.sections.map((s, i) => (
              <Col key={s.stage} xs={24} sm={12} lg={8}>
                <Card size="small" hoverable
                  style={{ borderRadius: 12, borderLeft: `3px solid ${s.complete ? "#16a34a" : "#d97706"}` }}
                  onClick={() => STAGE_PATH[s.stage] && navigate(STAGE_PATH[s.stage]!)}>
                  <Space direction="vertical" size={4} style={{ width: "100%" }}>
                    <Space style={{ justifyContent: "space-between", width: "100%" }}>
                      <Text strong>{`${i + 1}. ${s.label}`}</Text>
                      {s.complete ? <Tag color="success">✓ 已齐全</Tag> : <Tag color="warning">待补齐</Tag>}
                    </Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>{s.detail}</Text>
                    <Button type="link" size="small" style={{ padding: 0 }}>查看明细 <RightOutlined /></Button>
                  </Space>
                </Card>
              </Col>
            ))}
          </Row>

          <Card size="small" style={{ borderRadius: 10 }}>
            <Space>
              <FolderViewOutlined style={{ color: "#2563eb" }} />
              <Text type="secondary" style={{ fontSize: 12 }}>
                本资料包可用于对内财税管理留档、对外申报与审计审查。打印或导出 PDF 后建议与凭证、报表、申报回执一并归档保存。
              </Text>
            </Space>
          </Card>
        </>
      )}
    </div>
  );
}
