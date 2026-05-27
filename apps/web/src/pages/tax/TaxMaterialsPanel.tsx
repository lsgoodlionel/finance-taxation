import React from "react";
import type {
  CorporateIncomeTaxPreparation,
  IndividualIncomeTaxMaterial,
  StampAndSurtaxSummary,
  VatWorkingPaper
} from "@finance-taxation/domain-model";
import { actionButtonStyle, cellStyle, miniStatStyle, panelStyle } from "./taxStyles";

export type TaxMaterialKey = "vat" | "iit" | "stamp" | "cit";

type TaxMaterialsPanelProps = {
  activeMaterial: TaxMaterialKey;
  vatPaper: VatWorkingPaper | null;
  incomeTaxPreparation: CorporateIncomeTaxPreparation | null;
  iitMaterials: IndividualIncomeTaxMaterial | null;
  stampAndSurtax: StampAndSurtaxSummary | null;
  vatFilingPeriod: string;
  iitFilingPeriod: string;
  stampFilingPeriod: string;
  incomeTaxPeriod: string;
  onSelectMaterial: (material: TaxMaterialKey) => void;
  onVatPeriodChange: (value: string) => void;
  onIitPeriodChange: (value: string) => void;
  onStampPeriodChange: (value: string) => void;
  onIncomeTaxPeriodChange: (value: string) => void;
  onGenerateVat: () => void;
  onPrintVat: () => void;
  onGenerateIit: () => void;
  onGenerateStamp: () => void;
  onGenerateCit: () => void;
  onPrintCit: () => void;
};

const MATERIAL_META: Record<TaxMaterialKey, { title: string; description: string }> = {
  vat: { title: "增值税底稿", description: "面向销项、进项、简易计税和应纳增值税的复核。" },
  iit: { title: "个税申报资料", description: "面向工资事项、代扣事项和申报清单的检查。" },
  stamp: { title: "印花税与附加税", description: "面向附加税和印花税事项汇总与备注。" },
  cit: { title: "企业所得税准备", description: "面向预缴与汇算准备、调整提示和清单。" }
};

export function TaxMaterialsPanel(props: TaxMaterialsPanelProps) {
  const {
    activeMaterial,
    vatPaper,
    incomeTaxPreparation,
    iitMaterials,
    stampAndSurtax,
    vatFilingPeriod,
    iitFilingPeriod,
    stampFilingPeriod,
    incomeTaxPeriod,
    onSelectMaterial,
    onVatPeriodChange,
    onIitPeriodChange,
    onStampPeriodChange,
    onIncomeTaxPeriodChange,
    onGenerateVat,
    onPrintVat,
    onGenerateIit,
    onGenerateStamp,
    onGenerateCit,
    onPrintCit
  } = props;

  const activeMeta = MATERIAL_META[activeMaterial];

  return (
    <article style={panelStyle()}>
      <div style={{ display: "grid", gap: "16px" }}>
        <div>
          <h3 style={{ margin: 0 }}>税务资料与底稿</h3>
          <p style={{ margin: "8px 0 0", color: "#5c6b7a", lineHeight: 1.7 }}>
            先切换资料视图，再生成对应底稿或准备稿；打印动作保留在已生成结果之后，避免空打印。
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "12px" }}>
          {(Object.keys(MATERIAL_META) as TaxMaterialKey[]).map((key) => (
            <button
              key={key}
              onClick={() => onSelectMaterial(key)}
              style={{
                ...miniStatStyle(),
                cursor: "pointer",
                textAlign: "left",
                background: activeMaterial === key ? "rgba(79,142,247,0.12)" : "rgba(255,255,255,0.72)",
                border: activeMaterial === key ? "1px solid rgba(79,142,247,0.36)" : "1px solid rgba(20,40,60,0.08)"
              }}
            >
              <div style={{ fontSize: "12px", color: "#6c7a89" }}>资料视图</div>
              <strong style={{ display: "block", marginTop: "8px" }}>{MATERIAL_META[key].title}</strong>
              <div style={{ marginTop: "6px", fontSize: "12px", color: "#5c6b7a", lineHeight: 1.6 }}>{MATERIAL_META[key].description}</div>
            </button>
          ))}
        </div>
        <section style={{ borderRadius: "18px", border: "1px solid rgba(20,40,60,0.08)", padding: "20px", background: "rgba(255,255,255,0.7)" }}>
          <div style={{ marginBottom: "16px" }}>
            <h4 style={{ margin: 0 }}>{activeMeta.title}</h4>
            <p style={{ margin: "8px 0 0", color: "#5c6b7a", lineHeight: 1.7 }}>{activeMeta.description}</p>
          </div>
          {activeMaterial === "vat" && (
            <div style={{ display: "grid", gap: "12px" }}>
              <div style={{ display: "flex", gap: "10px" }}>
                <input value={vatFilingPeriod} onChange={(event) => onVatPeriodChange(event.target.value)} placeholder="申报期" />
                <button onClick={onGenerateVat} style={actionButtonStyle("primary")}>生成底稿</button>
                <button onClick={onPrintVat} style={actionButtonStyle()}>打印底稿</button>
              </div>
              {vatPaper ? (
                <>
                  <div style={{ lineHeight: 1.8 }}>
                    <div>纳税人口径：{vatPaper.taxpayerType}</div>
                    <div>申报期：{vatPaper.filingPeriod}</div>
                    <div>销项税额：{vatPaper.outputTaxAmount}</div>
                    <div>进项税额：{vatPaper.inputTaxAmount}</div>
                    <div>简易计税额：{vatPaper.simplifiedTaxAmount}</div>
                    <div>应纳增值税：{vatPaper.payableVatAmount}</div>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={cellStyle()}>类型</th>
                        <th style={cellStyle()}>说明</th>
                        <th style={cellStyle()}>税率</th>
                        <th style={cellStyle()}>计税基础</th>
                        <th style={cellStyle()}>税额</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vatPaper.lines.map((line) => (
                        <tr key={line.id}>
                          <td style={cellStyle()}>{line.sourceType}</td>
                          <td style={cellStyle()}>{line.description}</td>
                          <td style={cellStyle()}>{line.taxRate}%</td>
                          <td style={cellStyle()}>{line.taxableAmount}</td>
                          <td style={cellStyle()}>{line.taxAmount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : (
                <p style={{ margin: 0, color: "#6c7a89" }}>尚未生成增值税底稿。</p>
              )}
            </div>
          )}
          {activeMaterial === "iit" && (
            <div style={{ display: "grid", gap: "12px" }}>
              <div style={{ display: "flex", gap: "10px" }}>
                <input value={iitFilingPeriod} onChange={(event) => onIitPeriodChange(event.target.value)} placeholder="申报期" />
                <button onClick={onGenerateIit} style={actionButtonStyle("primary")}>生成个税资料</button>
              </div>
              {iitMaterials ? (
                <div style={{ lineHeight: 1.8 }}>
                  <div>申报期：{iitMaterials.filingPeriod}</div>
                  <div>工资事项数：{iitMaterials.payrollEventCount}</div>
                  <div>代扣事项数：{iitMaterials.withholdingItemCount}</div>
                  <div>工资总额：{iitMaterials.totalPayrollAmount}</div>
                  <ul style={{ paddingLeft: "20px", marginBottom: 0 }}>
                    {iitMaterials.checklist.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p style={{ margin: 0, color: "#6c7a89" }}>尚未生成个税申报资料。</p>
              )}
            </div>
          )}
          {activeMaterial === "stamp" && (
            <div style={{ display: "grid", gap: "12px" }}>
              <div style={{ display: "flex", gap: "10px" }}>
                <input value={stampFilingPeriod} onChange={(event) => onStampPeriodChange(event.target.value)} placeholder="申报期" />
                <button onClick={onGenerateStamp} style={actionButtonStyle("primary")}>汇总税务事项</button>
              </div>
              {stampAndSurtax ? (
                <div style={{ lineHeight: 1.8 }}>
                  <div>申报期：{stampAndSurtax.filingPeriod}</div>
                  <div>印花税事项数：{stampAndSurtax.stampDutyItems.length}</div>
                  <div>附加税事项数：{stampAndSurtax.surtaxItems.length}</div>
                  <ul style={{ paddingLeft: "20px", marginBottom: 0 }}>
                    {stampAndSurtax.notes.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p style={{ margin: 0, color: "#6c7a89" }}>尚未汇总印花税与附加税事项。</p>
              )}
            </div>
          )}
          {activeMaterial === "cit" && (
            <div style={{ display: "grid", gap: "12px" }}>
              <div style={{ display: "flex", gap: "10px" }}>
                <input value={incomeTaxPeriod} onChange={(event) => onIncomeTaxPeriodChange(event.target.value)} placeholder="申报期" />
                <button onClick={onGenerateCit} style={actionButtonStyle("primary")}>生成准备稿</button>
                <button onClick={onPrintCit} style={actionButtonStyle()}>打印准备稿</button>
              </div>
              {incomeTaxPreparation ? (
                <div style={{ lineHeight: 1.8 }}>
                  <div>申报期：{incomeTaxPreparation.filingPeriod}</div>
                  <div>会计利润：{incomeTaxPreparation.accountingProfit}</div>
                  <div>应纳税所得额估算：{incomeTaxPreparation.taxableIncomeEstimate}</div>
                  <div>税率：{incomeTaxPreparation.incomeTaxRate}%</div>
                  <div>预缴税额估算：{incomeTaxPreparation.prepaymentTaxEstimate}</div>
                  <h4>调整提示</h4>
                  <ul style={{ paddingLeft: "20px" }}>
                    {incomeTaxPreparation.adjustmentHints.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <h4>准备清单</h4>
                  <ul style={{ paddingLeft: "20px", marginBottom: 0 }}>
                    {incomeTaxPreparation.checklist.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p style={{ margin: 0, color: "#6c7a89" }}>尚未生成企业所得税预缴与汇算准备。</p>
              )}
            </div>
          )}
        </section>
      </div>
    </article>
  );
}
