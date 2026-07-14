import { Card } from "antd";
import { ExportRndPanel } from "../export/ExportRndPanel";
import { ExportVouchersPanel } from "../export/ExportVouchersPanel";
import { batchButtonStyle, cellStyle, renderExportActionButton } from "./export-center-helpers";
import { buildExportFileName } from "../pdf-export-utils";
import type { ExportCenterData } from "./useExportCenterData";

type RndAndVoucherCardsProps = {
  data: ExportCenterData;
};

/** 「研发辅助」与「凭证导出」两个导出场景卡片。 */
export function RndAndVoucherCards({ data }: RndAndVoucherCardsProps) {
  return (
    <>
      <Card title="🔬 研发辅助" style={{ borderRadius: 16 }}>
        <ExportRndPanel
          projects={data.rndProjects}
          onOpenProject={data.openRndProject}
          renderActionButton={renderExportActionButton}
          cellStyle={cellStyle}
        />
      </Card>
      <Card title="🧷 凭证导出" style={{ borderRadius: 16 }}>
        <ExportVouchersPanel
          vouchers={data.vouchers}
          selectedIds={data.selectedVoucherIds}
          onToggleSelection={data.toggleVoucherSelection}
          onBatchOpen={data.batchOpenVouchers}
          onOpenVoucher={data.openVoucherPdf}
          buildFileName={(voucher) => buildExportFileName(["凭证", voucher.id.slice(-8).toUpperCase(), voucher.voucherType])}
          cellStyle={cellStyle}
          batchButtonStyle={batchButtonStyle}
        />
      </Card>
    </>
  );
}
