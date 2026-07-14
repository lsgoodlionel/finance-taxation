/**
 * 导出与归档中心（G1）：合并原 PdfExportPage（/pdf-export，8 大导出场景：财务报表、
 * 工资材料、税务材料、批量归档、单据模板、风险复盘、研发辅助、凭证导出）与
 * ArchivePackagePage（/archive-package，按期间的财税资料包总览）为统一入口。
 *
 * 布局：场景卡片区（含资料包总览）+ 历史记录 Tab（导出任务/归档索引/审计轨迹）。
 */
import { Tabs, Space } from "antd";
import { PageHeader } from "../../components/ui/PageHeader";
import { ResultBanner } from "../../components/ui/ResultBanner";
import { FinanceFlowBar } from "../../components/FinanceFlowBar";
import { ArchivePackageCard } from "./ArchivePackageCard";
import { PayrollAndTaxCards } from "./PayrollAndTaxCards";
import { ReportsAndPackagesCards } from "./ReportsAndPackagesCards";
import { DocumentsAndRiskCards } from "./DocumentsAndRiskCards";
import { RndAndVoucherCards } from "./RndAndVoucherCards";
import { ExportHistorySection } from "./ExportHistorySection";
import { useExportCenterData } from "./useExportCenterData";

export function ExportCenterPage() {
  const data = useExportCenterData();

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section className="v3-hero-shell">
        <PageHeader
          title="导出与归档中心"
          subtitle="统一管理财务报表、工资、税务、资料包、单据、风险、研发和凭证的打印/导出，并按会计期间沉淀为可审查、可留档的财税资料包。"
        />
      </section>

      <FinanceFlowBar current="archive" />

      <section className="v3-section-shell" data-tone="muted">
        <Space direction="vertical" style={{ width: "100%" }}>
          {data.message ? <ResultBanner tone="info" message={data.message} /> : null}
          <ResultBanner tone="success" message="打开导出链接后，在浏览器中按 Ctrl+P（Mac: ⌘+P），选择「另存为 PDF」即可保存 PDF 文件。" />
        </Space>
      </section>

      <Tabs
        defaultActiveKey="scenes"
        items={[
          {
            key: "scenes",
            label: "场景导出",
            children: (
              <div style={{ display: "grid", gap: 16 }}>
                <ArchivePackageCard
                  period={data.period}
                  pkg={data.archivePackage}
                  loading={data.archivePackageLoading}
                  onReload={data.reloadArchivePackage}
                />
                <PayrollAndTaxCards data={data} />
                <ReportsAndPackagesCards data={data} />
                <DocumentsAndRiskCards data={data} />
                <RndAndVoucherCards data={data} />
              </div>
            )
          },
          {
            key: "history",
            label: "历史记录",
            children: <ExportHistorySection data={data} />
          }
        ]}
      />
    </div>
  );
}
