import { Card } from "antd";
import { ExportDocumentsPanel } from "../export/ExportDocumentsPanel";
import { ExportRiskPanel } from "../export/ExportRiskPanel";
import { batchButtonStyle, cellStyle, renderExportActionButton } from "./export-center-helpers";
import { buildExportFileName } from "../pdf-export-utils";
import type { ExportCenterData } from "./useExportCenterData";

type DocumentsAndRiskCardsProps = {
  data: ExportCenterData;
};

/** 「单据模板」与「风险复盘」两个导出场景卡片。 */
export function DocumentsAndRiskCards({ data }: DocumentsAndRiskCardsProps) {
  return (
    <>
      <Card title="📁 单据模板" style={{ borderRadius: 16 }}>
        <ExportDocumentsPanel
          documents={data.documents}
          selectedIds={data.selectedDocumentIds}
          onToggleSelection={data.toggleDocumentSelection}
          onBatchOpen={data.batchOpenDocuments}
          onOpenDocument={data.openDocumentTemplate}
          buildFileName={(document) => buildExportFileName([document.title, document.documentType, document.businessEventId])}
          cellStyle={cellStyle}
          batchButtonStyle={batchButtonStyle}
        />
      </Card>
      <Card title="🔍 风险复盘" style={{ borderRadius: 16 }}>
        <ExportRiskPanel
          findings={data.findings}
          onOpenFinding={data.openRiskFinding}
          renderActionButton={renderExportActionButton}
          cellStyle={cellStyle}
        />
      </Card>
    </>
  );
}
