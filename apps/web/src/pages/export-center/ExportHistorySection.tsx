import { Tabs } from "antd";
import { ExportHistoryPanel } from "../export/ExportHistoryPanel";
import { ExportArchivePanel } from "../export/ExportArchivePanel";
import { ExportAuditPanel } from "../export/ExportAuditPanel";
import { cellStyle, renderExportActionButton } from "./export-center-helpers";
import type { ExportCenterData } from "./useExportCenterData";

type ExportHistorySectionProps = {
  data: ExportCenterData;
};

/** 历史记录区：导出任务历史、归档索引、导出审计轨迹三个 Tab。 */
export function ExportHistorySection({ data }: ExportHistorySectionProps) {
  return (
    <Tabs
      defaultActiveKey="jobs"
      items={[
        {
          key: "jobs",
          label: `导出任务历史（${data.exportHistory.length}）`,
          children: (
            <ExportHistoryPanel
              jobs={data.exportHistory}
              highlightedJobId={data.navExportJobId}
              onUpdateStatus={data.handleUpdateExportStatus}
              renderActionButton={renderExportActionButton}
              cellStyle={cellStyle}
            />
          )
        },
        {
          key: "archive",
          label: `归档索引（${data.archiveEntries.length}）`,
          children: (
            <ExportArchivePanel
              archiveEntries={data.archiveEntries}
              archiveKindFilter={data.archiveKindFilter}
              archiveKeyword={data.archiveKeyword}
              onKindFilterChange={data.setArchiveKindFilter}
              onKeywordChange={data.setArchiveKeyword}
              cellStyle={cellStyle}
            />
          )
        },
        {
          key: "audit",
          label: `导出审计轨迹（${data.exportAuditLogs.length}）`,
          children: <ExportAuditPanel logs={data.exportAuditLogs} cellStyle={cellStyle} />
        }
      ]}
    />
  );
}
