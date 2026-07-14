import { Card } from "antd";
import { ExportPayrollPanel } from "../export/ExportPayrollPanel";
import { ExportTaxPanel } from "../export/ExportTaxPanel";
import { cellStyle, renderExportActionButton } from "./export-center-helpers";
import type { ExportCenterData } from "./useExportCenterData";

type PayrollAndTaxCardsProps = {
  data: ExportCenterData;
};

/** 「工资材料」与「税务材料」两个导出场景卡片。 */
export function PayrollAndTaxCards({ data }: PayrollAndTaxCardsProps) {
  return (
    <>
      <Card title="💰 工资材料" style={{ borderRadius: 16 }}>
        <ExportPayrollPanel
          periods={data.periods}
          onOpenPayrollSummary={data.openPayrollSummary}
          onOpenPayrollSlips={data.openPayrollSlips}
          renderActionButton={renderExportActionButton}
          cellStyle={cellStyle}
        />
      </Card>
      <Card title="🧾 税务材料" style={{ borderRadius: 16 }}>
        <ExportTaxPanel
          vatFilingPeriod={data.vatFilingPeriod}
          citFilingPeriod={data.citFilingPeriod}
          onVatPeriodChange={data.setVatFilingPeriod}
          onCitPeriodChange={data.setCitFilingPeriod}
          onOpenVat={() => data.openTaxWorkingPaper("vat", data.vatFilingPeriod, "增值税底稿")}
          onOpenCit={() => data.openTaxWorkingPaper("corporate_income_tax", data.citFilingPeriod, "企业所得税准备")}
          renderActionButton={renderExportActionButton}
        />
      </Card>
    </>
  );
}
