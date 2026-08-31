import React from "react";
import type {
  CorporateIncomeTaxPreparation,
  IndividualIncomeTaxMaterial,
  StampAndSurtaxSummary,
  VatWorkingPaper
} from "@finance-taxation/domain-model";
import { actionButtonStyle, cellStyle, miniStatStyle, panelStyle } from "./taxStyles";
import { Term } from "../../components/ui/Term";
import { TaxPaymentEntry } from "./TaxPaymentEntry";
import { LossLedgerEntry } from "./LossLedgerEntry";
import type { LossLedgerRecord } from "../../lib/api-loss-ledger";
import type { TaxPaymentRecord } from "../../lib/api-tax-payments";

/** 分转元，用于展示。null 由调用处先挡掉——这里不该出现。 */
function yuan(cents: number | null): string {
  if (cents === null) return "—";
  return `${(cents / 100).toFixed(2)} 元`;
}

export type TaxMaterialKey = "vat" | "iit" | "stamp" | "cit";

type TaxMaterialsPanelProps = {
  activeMaterial: TaxMaterialKey;
  vatPaper: VatWorkingPaper | null;
  incomeTaxPreparation: CorporateIncomeTaxPreparation | null;
  iitMaterials: IndividualIncomeTaxMaterial | null;
  stampAndSurtax: StampAndSurtaxSummary | null;
  /** 本期已登记的税款缴款记录。附加税的计税依据就是它们的合计。 */
  taxPayments: TaxPaymentRecord[];
  onTaxPaymentCreated(): void;
  /** 以前年度亏损台账（V17 阶段三批次 C）。 */
  lossLedger: LossLedgerRecord[];
  onLossLedgerCreated(): void;
  /** 结转年限：一般企业 5 年，高新技术企业 10 年。 */
  lossCarryforwardYears: number;
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

const TAXPAYER_TYPE_LABELS: Record<string, string> = {
  general_vat: "一般纳税人",
  small_scale: "小规模纳税人",
  general_simplified: "一般纳税人简易计税"
};

export function TaxMaterialsPanel(props: TaxMaterialsPanelProps) {
  const {
    activeMaterial,
    vatPaper,
    incomeTaxPreparation,
    iitMaterials,
    stampAndSurtax,
    taxPayments,
    onTaxPaymentCreated,
    lossLedger,
    onLossLedgerCreated,
    lossCarryforwardYears,
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
          <h3 style={{ margin: 0 }}>税务资料与<Term k="working-paper">底稿</Term></h3>
          <p style={{ margin: "8px 0 0", color: "#5c6b7a", lineHeight: 1.7 }}>
            先切换资料视图，再生成对应<Term k="working-paper">底稿</Term>或准备稿；打印动作保留在已生成结果之后，避免空打印。
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px" }}>
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
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <input value={vatFilingPeriod} onChange={(event) => onVatPeriodChange(event.target.value)} placeholder="申报期" style={{ minWidth: "180px" }} />
                <button onClick={onGenerateVat} style={actionButtonStyle("primary")}>生成底稿</button>
                <button onClick={onPrintVat} style={actionButtonStyle()}>打印底稿</button>
              </div>
              {vatPaper ? (
                <>
                  <div style={{ lineHeight: 1.8 }}>
                    <div>纳税人口径：{TAXPAYER_TYPE_LABELS[vatPaper.taxpayerType] ?? vatPaper.taxpayerType}</div>
                    <div>申报期：{vatPaper.filingPeriod}</div>
                    <div><Term k="output-vat">销项税额</Term>：{vatPaper.outputTaxAmount}</div>
                    <div><Term k="input-vat">进项税额</Term>：{vatPaper.inputTaxAmount}</div>
                    <div>简易计税额：{vatPaper.simplifiedTaxAmount}</div>
                    <div>应纳<Term k="vat">增值税</Term>：{vatPaper.payableVatAmount}</div>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", minWidth: "720px", borderCollapse: "collapse" }}>
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
                  </div>
                </>
              ) : (
                <p style={{ margin: 0, color: "#6c7a89" }}>尚未生成<Term k="vat">增值税</Term><Term k="working-paper">底稿</Term>。</p>
              )}
            </div>
          )}
          {activeMaterial === "iit" && (
            <div style={{ display: "grid", gap: "12px" }}>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <input value={iitFilingPeriod} onChange={(event) => onIitPeriodChange(event.target.value)} placeholder="申报期" style={{ minWidth: "180px" }} />
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
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <input value={stampFilingPeriod} onChange={(event) => onStampPeriodChange(event.target.value)} placeholder="申报期" style={{ minWidth: "180px" }} />
                <button onClick={onGenerateStamp} style={actionButtonStyle("primary")}>汇总税务事项</button>
              </div>
              {stampAndSurtax ? (
                <div style={{ lineHeight: 1.8 }}>
                  <div>申报期：{stampAndSurtax.filingPeriod}</div>
                  <div><Term k="stamp-duty">印花税</Term>事项数：{stampAndSurtax.stampDutyItems.length}</div>
                  <div><Term k="surtax">附加税</Term>事项数：{stampAndSurtax.surtaxItems.length}</div>

                  {/*
                    算出来的附加税（V17 阶段三批次 B）。此前这块只有一个
                    「事项数：0」——那个数永远是 0，因为没人手工建税项，
                    而系统一分钱都不算。
                  */}
                  {stampAndSurtax.surtax.totalCents === null ? (
                    <div style={{ color: "#b45309", marginTop: 8 }}>
                      <strong>附加税暂时算不出</strong>——{stampAndSurtax.surtax.reason}
                    </div>
                  ) : (
                    <div style={{ marginTop: 8 }}>
                      <div>城市维护建设税：{yuan(stampAndSurtax.surtax.urbanConstructionCents)}</div>
                      <div>教育费附加：{yuan(stampAndSurtax.surtax.educationSurchargeCents)}</div>
                      <div>地方教育附加：{yuan(stampAndSurtax.surtax.localEducationSurchargeCents)}</div>
                      <div>
                        <strong>合计：{yuan(stampAndSurtax.surtax.totalCents)}</strong>
                      </div>
                      {stampAndSurtax.surtax.reductionCents > 0 && (
                        <div style={{ color: "#15803d" }}>
                          六税两费减半减征：{yuan(stampAndSurtax.surtax.reductionCents)}
                        </div>
                      )}
                    </div>
                  )}
                  <ul style={{ paddingLeft: "20px", marginBottom: 0 }}>
                    {stampAndSurtax.notes.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p style={{ margin: 0, color: "#6c7a89" }}>尚未汇总<Term k="stamp-duty">印花税</Term>与<Term k="surtax">附加税</Term>事项。</p>
              )}

              {/*
                缴款登记的入口放在这里：用户在上面看到「等主税缴纳后即可计算」，
                该做的事的入口就应该在这句话旁边，而不是让人去别的页面找。
              */}
              <TaxPaymentEntry
                filingPeriod={stampFilingPeriod}
                payments={taxPayments}
                onCreated={onTaxPaymentCreated}
              />
            </div>
          )}
          {activeMaterial === "cit" && (
            <div style={{ display: "grid", gap: "12px" }}>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <input value={incomeTaxPeriod} onChange={(event) => onIncomeTaxPeriodChange(event.target.value)} placeholder="申报期" style={{ minWidth: "180px" }} />
                <button onClick={onGenerateCit} style={actionButtonStyle("primary")}>生成准备稿</button>
                <button onClick={onPrintCit} style={actionButtonStyle()}>打印准备稿</button>
              </div>
              {incomeTaxPreparation ? (
                <div style={{ lineHeight: 1.8 }}>
                  <div>申报期：{incomeTaxPreparation.filingPeriod}</div>
                  <div>会计利润：{incomeTaxPreparation.accountingProfit}</div>
                  <div>应纳税所得额估算：{incomeTaxPreparation.taxableIncomeEstimate}</div>
                  {/*
                    弥补与抵减的三步要都显示：利润 → 弥补后基数 → 应补退。
                    只给最后一个数字的话，对不上账时用户无从查起。
                  */}
                  {Number(incomeTaxPreparation.lossOffset) > 0 && (
                    <>
                      <div>弥补以前年度亏损：-{incomeTaxPreparation.lossOffset}</div>
                      <div>
                        <strong>弥补后应纳税所得额：{incomeTaxPreparation.taxableIncomeAfterLoss}</strong>
                      </div>
                    </>
                  )}
                  {incomeTaxPreparation.expiredLossNotice && (
                    <div style={{ color: "#b45309" }}>
                      {incomeTaxPreparation.expiredLossNotice}
                    </div>
                  )}
                  {/*
                    税率可能是 null（优惠资格未登记）。此前这里写的是
                    `{incomeTaxRate}%`，null 会渲染成「税率：%」——
                    一个看不懂的空白，用户不知道是系统坏了还是税率真是空的。
                  */}
                  {incomeTaxPreparation.incomeTaxRate === null ? (
                    <div style={{ color: "#b45309" }}>
                      税率：<strong>待确认</strong>——{incomeTaxPreparation.preferenceNotice}
                    </div>
                  ) : (
                    <>
                      <div>
                        税率：{incomeTaxPreparation.incomeTaxRate}%
                        {incomeTaxPreparation.preferenceKind === "small_profit" && (
                          <span style={{ color: "#6c7a89" }}>
                            （小型微利：减按 {incomeTaxPreparation.reducedInclusionPercent}% 计入
                            应纳税所得额，按 {incomeTaxPreparation.appliedRatePercent}% 征收）
                          </span>
                        )}
                        {incomeTaxPreparation.preferenceKind === "high_tech" && (
                          <span style={{ color: "#6c7a89" }}>（高新技术企业优惠）</span>
                        )}
                      </div>
                      <div>应纳税额：{incomeTaxPreparation.prepaymentTaxEstimate}</div>
                      <div>本期已预缴：{incomeTaxPreparation.prepaidTax}</div>
                      {incomeTaxPreparation.taxPayableOrRefundable !== null && (
                        <div>
                          {/*
                            **负数是应退**。显示成「应补 -155」会让用户以为
                            要交负数的钱——这两个词对应的动作完全不同。
                          */}
                          <strong>
                            {Number(incomeTaxPreparation.taxPayableOrRefundable) < 0
                              ? `应退税额：${Math.abs(Number(incomeTaxPreparation.taxPayableOrRefundable))}`
                              : `应补税额：${incomeTaxPreparation.taxPayableOrRefundable}`}
                          </strong>
                        </div>
                      )}
                    </>
                  )}
                  {Number(incomeTaxPreparation.carryforwardLoss) > 0 && (
                    <div>
                      可结转以后年度弥补的亏损：{incomeTaxPreparation.carryforwardLoss}
                    </div>
                  )}
                  <LossLedgerEntry
                    entries={lossLedger}
                    currentYear={Number(incomeTaxPeriod.slice(0, 4)) || new Date().getFullYear()}
                    carryforwardYears={lossCarryforwardYears}
                    onCreated={onLossLedgerCreated}
                  />
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
                <p style={{ margin: 0, color: "#6c7a89" }}>尚未生成<Term k="cit">企业所得税</Term>预缴与汇算准备。</p>
              )}
            </div>
          )}
        </section>
      </div>
    </article>
  );
}
