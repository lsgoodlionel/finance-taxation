import { Card } from "antd";
import { ExportReportsPanel } from "../export/ExportReportsPanel";
import { ExportPackagesPanel } from "../export/ExportPackagesPanel";
import { REPORT_TYPE_LABELS, batchButtonStyle, cellStyle, renderExportActionButton } from "./export-center-helpers";
import { buildExportFileName } from "../pdf-export-utils";
import type { ExportCenterData } from "./useExportCenterData";

type ReportsAndPackagesCardsProps = {
  data: ExportCenterData;
};

/** 「财务报表」快照与「批量归档」（月结/审计/稽核资料包）两个导出场景卡片。 */
export function ReportsAndPackagesCards({ data }: ReportsAndPackagesCardsProps) {
  return (
    <>
      <Card title="📊 财务报表" style={{ borderRadius: 16 }}>
        <ExportReportsPanel
          snapshots={data.snapshots}
          selectedIds={data.selectedReportIds}
          onToggleSelection={data.toggleReportSelection}
          onBatchOpen={data.batchOpenReports}
          onOpenSnapshot={data.openReportSnapshot}
          buildFileName={(snapshot) => buildExportFileName([REPORT_TYPE_LABELS[snapshot.reportType] ?? snapshot.reportType, snapshot.periodLabel, "快照"])}
          cellStyle={cellStyle}
          batchButtonStyle={batchButtonStyle}
        />
      </Card>
      <Card title="📦 批量归档（月结 / 审计 / 稽核）" style={{ borderRadius: 16 }}>
        <ExportPackagesPanel
          closingPeriod={data.closingPeriod}
          inspectionPeriod={data.inspectionPeriod}
          onClosingPeriodChange={data.setClosingPeriod}
          onInspectionPeriodChange={data.setInspectionPeriod}
          onOpenMonthEnd={() => data.openPackage("month_end", data.closingPeriod, "月结资料包")}
          onOpenAudit={() => data.openPackage("audit", data.inspectionPeriod, "审计资料包")}
          onOpenInspection={() => data.openPackage("inspection", data.inspectionPeriod, "稽核资料包")}
          renderActionButton={renderExportActionButton}
        />
      </Card>
    </>
  );
}
