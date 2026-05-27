import React from "react";
import type { PayrollRecord } from "@finance-taxation/domain-model";

type PayrollRecordsTableProps = {
  records: PayrollRecord[];
  formatAmount: (value: number) => string;
  getStatusLabel: (status: string) => string;
  getStatusColor: (status: string) => string;
  onConfirm: (recordId: string) => void;
  cellStyle: () => {
    borderBottom: string;
    padding: string;
    textAlign: "left";
    verticalAlign?: "top";
  };
};

export function PayrollRecordsTable({
  records,
  formatAmount,
  getStatusLabel,
  getStatusColor,
  onConfirm,
  cellStyle
}: PayrollRecordsTableProps) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", minWidth: "900px" }}>
        <thead>
          <tr style={{ color: "#6c7a89" }}>
            {["姓名", "应发工资", "个人社保", "单位社保", "个人公积金", "单位公积金", "个税", "实发工资", "状态", "操作"].map((header) => (
              <th key={header} style={{ ...cellStyle(), fontWeight: 500, whiteSpace: "nowrap" }}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              <td style={cellStyle()}>{record.employeeName}</td>
              <td style={cellStyle()}>¥{formatAmount(record.grossSalary)}</td>
              <td style={cellStyle()}>¥{formatAmount(record.socialSecurityEmployee)}</td>
              <td style={cellStyle()}>¥{formatAmount(record.socialSecurityEmployer)}</td>
              <td style={cellStyle()}>¥{formatAmount(record.housingFundEmployee)}</td>
              <td style={cellStyle()}>¥{formatAmount(record.housingFundEmployer)}</td>
              <td style={cellStyle()}>¥{formatAmount(record.iitWithheld)}</td>
              <td style={{ ...cellStyle(), fontWeight: 600 }}>¥{formatAmount(record.netPay)}</td>
              <td style={cellStyle()}>
                <span style={{ background: `${getStatusColor(record.status)}22`, color: getStatusColor(record.status), borderRadius: "999px", padding: "2px 8px", fontSize: "11px" }}>
                  {getStatusLabel(record.status)}
                </span>
              </td>
              <td style={cellStyle()}>
                {record.status === "draft" ? (
                  <button
                    onClick={() => onConfirm(record.id)}
                    style={{ fontSize: "11px", padding: "3px 10px", borderRadius: "6px", border: "1px solid #1a7f5a", color: "#1a7f5a", background: "none", cursor: "pointer" }}
                  >
                    确认
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: "rgba(30,42,55,0.04)", fontWeight: 600, fontSize: "13px" }}>
            <td style={{ ...cellStyle(), borderTop: "2px solid rgba(20,40,60,0.12)" }}>合计</td>
            <td style={{ ...cellStyle(), borderTop: "2px solid rgba(20,40,60,0.12)" }}>¥{formatAmount(records.reduce((sum, item) => sum + item.grossSalary, 0))}</td>
            <td style={{ ...cellStyle(), borderTop: "2px solid rgba(20,40,60,0.12)" }}>¥{formatAmount(records.reduce((sum, item) => sum + item.socialSecurityEmployee, 0))}</td>
            <td style={{ ...cellStyle(), borderTop: "2px solid rgba(20,40,60,0.12)" }}>¥{formatAmount(records.reduce((sum, item) => sum + item.socialSecurityEmployer, 0))}</td>
            <td style={{ ...cellStyle(), borderTop: "2px solid rgba(20,40,60,0.12)" }}>¥{formatAmount(records.reduce((sum, item) => sum + item.housingFundEmployee, 0))}</td>
            <td style={{ ...cellStyle(), borderTop: "2px solid rgba(20,40,60,0.12)" }}>¥{formatAmount(records.reduce((sum, item) => sum + item.housingFundEmployer, 0))}</td>
            <td style={{ ...cellStyle(), borderTop: "2px solid rgba(20,40,60,0.12)" }}>¥{formatAmount(records.reduce((sum, item) => sum + item.iitWithheld, 0))}</td>
            <td style={{ ...cellStyle(), borderTop: "2px solid rgba(20,40,60,0.12)" }}>¥{formatAmount(records.reduce((sum, item) => sum + item.netPay, 0))}</td>
            <td colSpan={2} style={{ ...cellStyle(), borderTop: "2px solid rgba(20,40,60,0.12)" }} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
