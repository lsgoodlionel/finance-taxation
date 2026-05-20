import { useEffect, useState } from "react";
import { useI18n, TAX_STATUS_LABELS, TAX_BATCH_STATUS_LABELS, REVIEW_RESULT_LABELS } from "../lib/i18n";

function TaxHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: "16px", padding: "28px 32px", maxWidth: "560px", width: "92%", boxShadow: "0 8px 40px rgba(0,0,0,0.2)", maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>财税中心 · 业务操作说明</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "#9aa5b4" }}>✕</button>
        </div>
        <div style={{ display: "grid", gap: "14px", fontSize: "13.5px", lineHeight: 1.75 }}>
          <div style={{ background: "rgba(37,99,235,0.06)", borderRadius: "10px", padding: "14px 16px", border: "1px solid rgba(37,99,235,0.18)" }}>
            <strong>核心概念</strong><br />
            财税中心统一管理公司各类税种的申报工作。系统根据经营事项自动生成<strong>税务事项</strong>，再将同期同税种事项归集为<strong>申报批次</strong>，最终通过批次完成<strong>校验 → 复核 → 申报 → 留档</strong>的完整申报流程。
          </div>
          <div><strong>操作流程</strong>
            <ol style={{ margin: "6px 0 0 18px", padding: 0 }}>
              <li><strong>配置纳税人档案</strong>：设置税种、申报周期、税率等基本参数（右侧"纳税人档案"栏）</li>
              <li><strong>查看税务事项</strong>：由 AI 分析经营事项后自动生成，含税种、申报期、处理建议</li>
              <li><strong>组建申报批次</strong>：按税种和申报期将相关税务事项合并成批次，统一管理</li>
              <li><strong>校验批次</strong>：系统自动核查批次内数据的完整性和合规性</li>
              <li><strong>复核批次</strong>：由财务负责人审核批次内容并记录复核结论</li>
              <li><strong>提交申报</strong>：标记申报完成，状态更新为「已申报」</li>
              <li><strong>留档归档</strong>：将申报批次及相关凭证永久留档，完成闭环</li>
            </ol>
          </div>
          <div><strong>税务事项状态</strong>
            {[["待处理", "事项已生成，尚未处理"], ["需关注", "存在潜在风险，需人工复核"], ["已申报", "已完成本期申报"], ["已逾期", "申报期已过但未完成申报"], ["免申报", "本期免于申报（如小规模纳税人等）"]].map(([s, d]) => (
              <div key={s} style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                <span style={{ fontWeight: 600, minWidth: "50px" }}>{s}</span><span style={{ color: "#4d5d6c" }}>{d}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
import type {
  CorporateIncomeTaxPreparation,
  IndividualIncomeTaxMaterial,
  StampAndSurtaxSummary,
  TaxFilingBatch,
  TaxFilingBatchArchiveRecord,
  TaxFilingBatchReviewRecord,
  TaxItem,
  TaxpayerProfile,
  TaxRuleProfile,
  VatWorkingPaper
} from "@finance-taxation/domain-model";
import {
  archiveTaxFilingBatch,
  createTaxpayerProfile,
  getCorporateIncomeTaxPreparation,
  getIndividualIncomeTaxMaterials,
  getStampAndSurtaxSummary,
  getTaxFilingBatchDetail,
  getTaxPrintableHtml,
  getTaxRuleProfile,
  getVatWorkingPaper,
  listTaxFilingBatches,
  listTaxItems,
  listTaxpayerProfiles,
  reviewTaxFilingBatch,
  submitTaxFilingBatch,
  validateTaxFilingBatch
} from "../lib/api";

function panelStyle() {
  return {
    background: "rgba(255,255,255,0.82)",
    borderRadius: "24px",
    border: "1px solid rgba(20,40,60,0.08)",
    padding: "24px"
  } as const;
}

function cellStyle() {
  return {
    borderBottom: "1px solid rgba(20,40,60,0.08)",
    padding: "10px 8px",
    textAlign: "left" as const,
    verticalAlign: "top" as const
  };
}

export function TaxPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<TaxItem[]>([]);
  const [batches, setBatches] = useState<TaxFilingBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [selectedBatchDetail, setSelectedBatchDetail] = useState<(
    TaxFilingBatch & {
      items: TaxItem[];
      reviews: TaxFilingBatchReviewRecord[];
      archives: TaxFilingBatchArchiveRecord[];
    }
  ) | null>(null);
  const [validation, setValidation] = useState<{ valid: boolean; issues: string[]; itemCount: number } | null>(null);
  const [profiles, setProfiles] = useState<TaxpayerProfile[]>([]);
  const [vatPaper, setVatPaper] = useState<VatWorkingPaper | null>(null);
  const [incomeTaxPreparation, setIncomeTaxPreparation] = useState<CorporateIncomeTaxPreparation | null>(null);
  const [iitMaterials, setIitMaterials] = useState<IndividualIncomeTaxMaterial | null>(null);
  const [stampAndSurtax, setStampAndSurtax] = useState<StampAndSurtaxSummary | null>(null);
  const [ruleProfile, setRuleProfile] = useState<(TaxRuleProfile & { filingPeriod: string }) | null>(null);
  const [vatFilingPeriod, setVatFilingPeriod] = useState("2026-05");
  const [iitFilingPeriod, setIitFilingPeriod] = useState("2026-05");
  const [stampFilingPeriod, setStampFilingPeriod] = useState("2026-Q2");
  const [incomeTaxPeriod, setIncomeTaxPeriod] = useState("2026-Q2");
  const [reviewForm, setReviewForm] = useState({
    reviewResult: "approved" as "approved" | "rejected",
    reviewNotes: ""
  });
  const [archiveForm, setArchiveForm] = useState({
    archiveLabel: "",
    archiveNotes: ""
  });
  const [profileForm, setProfileForm] = useState({
    taxpayerType: "general_vat" as "general_vat" | "small_scale" | "general_simplified",
    effectiveFrom: "2026-05-01",
    notes: ""
  });
  const [message, setMessage] = useState("正在准备税务数据。");
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    async function bootstrap() {
      try {
        const [itemsPayload, batchesPayload, profilesPayload] = await Promise.all([
          listTaxItems(),
          listTaxFilingBatches(),
          listTaxpayerProfiles()
        ]);
        setItems(itemsPayload.items);
        setBatches(batchesPayload.items);
        setProfiles(profilesPayload.items);
        const first = batchesPayload.items[0]?.id || null;
        setSelectedBatchId(first);
        if (first) {
          setSelectedBatchDetail(await getTaxFilingBatchDetail(first));
        }
        setMessage(
          `已加载 ${itemsPayload.total} 条税务事项，${batchesPayload.total} 个申报批次。`
        );
      } catch (error) {
        setMessage((error as Error).message);
      }
    }
    void bootstrap();
  }, []);

  async function refreshBatches(batchId?: string) {
    const batchesPayload = await listTaxFilingBatches();
    setBatches(batchesPayload.items);
    const targetId = batchId || selectedBatchId || batchesPayload.items[0]?.id || null;
    setSelectedBatchId(targetId);
    if (targetId) {
      setSelectedBatchDetail(await getTaxFilingBatchDetail(targetId));
    }
  }

  return (
    <section style={{ display: "grid", gap: "20px" }}>
      {showHelp && <TaxHelpModal onClose={() => setShowHelp(false)} />}
      <article style={panelStyle()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
          <h2 style={{ margin: 0 }}>税务中心</h2>
          <button onClick={() => setShowHelp(true)} title="业务说明" style={{ width: "26px", height: "26px", borderRadius: "50%", border: "1.5px solid rgba(79,142,247,0.6)", background: "rgba(79,142,247,0.08)", color: "#4f8ef7", fontWeight: 700, fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>?</button>
        </div>
        <p style={{ margin: "0 0 12px", lineHeight: 1.8 }}>{message}</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "10px" }}>
          <select
            value={profileForm.taxpayerType}
            onChange={(event) =>
              setProfileForm((current) => ({
                ...current,
                taxpayerType: event.target.value as typeof current.taxpayerType
              }))
            }
          >
            <option value="general_vat">一般纳税人</option>
            <option value="small_scale">小规模纳税人</option>
            <option value="general_simplified">一般纳税人简易计税</option>
          </select>
          <input
            value={profileForm.effectiveFrom}
            onChange={(event) => setProfileForm((current) => ({ ...current, effectiveFrom: event.target.value }))}
          />
          <input
            value={profileForm.notes}
            onChange={(event) => setProfileForm((current) => ({ ...current, notes: event.target.value }))}
            placeholder="说明"
          />
          <button
            onClick={() =>
              void createTaxpayerProfile(profileForm)
                .then(() => listTaxpayerProfiles())
                .then((payload) => {
                  setProfiles(payload.items);
                  return getTaxRuleProfile("增值税", profileForm.effectiveFrom);
                })
                .then((payload) => {
                  setRuleProfile(payload);
                  setMessage("已保存纳税人口径。");
                })
                .catch((error) => setMessage((error as Error).message))
            }
          >
            保存纳税人口径
          </button>
        </div>
      </article>
      <article style={panelStyle()}>
        <h3 style={{ marginTop: 0 }}>纳税人口径档案</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={cellStyle()}>类型</th>
              <th style={cellStyle()}>生效日期</th>
              <th style={cellStyle()}>状态</th>
              <th style={cellStyle()}>说明</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((profile) => (
              <tr key={profile.id}>
                <td style={cellStyle()}>{profile.taxpayerType}</td>
                <td style={cellStyle()}>{profile.effectiveFrom}</td>
                <td style={cellStyle()}>{profile.status}</td>
                <td style={cellStyle()}>{profile.notes || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
      <article style={panelStyle()}>
        <h3 style={{ marginTop: 0 }}>税率规则与期间规则</h3>
        <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "12px" }}>
          <button
            onClick={() =>
              void getTaxRuleProfile("增值税", profileForm.effectiveFrom)
                .then((payload) => {
                  setRuleProfile(payload);
                  setVatFilingPeriod(payload.filingPeriod);
                  setMessage("已解析增值税规则。");
                })
                .catch((error) => setMessage((error as Error).message))
            }
          >
            解析增值税规则
          </button>
        </div>
        {ruleProfile ? (
          <div style={{ lineHeight: 1.8 }}>
            <div>税种：{ruleProfile.taxType}</div>
            <div>纳税人口径：{ruleProfile.taxpayerType}</div>
            <div>申报频率：{ruleProfile.filingFrequency}</div>
            <div>默认税率：{ruleProfile.defaultRate}%</div>
            <div>推导申报期：{ruleProfile.filingPeriod}</div>
          </div>
        ) : (
          <p>尚未解析税率和期间规则。</p>
        )}
      </article>
      <article style={panelStyle()}>
        <h3 style={{ marginTop: 0 }}>税务事项</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={cellStyle()}>编号</th>
              <th style={cellStyle()}>税种</th>
              <th style={cellStyle()}>申报期</th>
              <th style={cellStyle()}>状态</th>
              <th style={cellStyle()}>事项</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td style={cellStyle()}>{item.id}</td>
                <td style={cellStyle()}>{item.taxType}</td>
                <td style={cellStyle()}>{item.filingPeriod}</td>
                <td style={cellStyle()}>{t(TAX_STATUS_LABELS, item.status)}</td>
                <td style={cellStyle()}>{item.treatment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
      <section style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: "20px" }}>
        <article style={panelStyle()}>
          <h3 style={{ marginTop: 0 }}>申报批次</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={cellStyle()}>批次编号</th>
                <th style={cellStyle()}>税种</th>
                <th style={cellStyle()}>状态</th>
                <th style={cellStyle()}>事项数</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => {
                    setSelectedBatchId(item.id);
                    setValidation(null);
                    void getTaxFilingBatchDetail(item.id).then(setSelectedBatchDetail);
                  }}
                  style={{
                    cursor: "pointer",
                    background: item.id === selectedBatchId ? "rgba(30,42,55,0.06)" : "transparent"
                  }}
                >
                  <td style={cellStyle()}>{item.id}</td>
                  <td style={cellStyle()}>{item.taxType}</td>
                  <td style={cellStyle()}>{t(TAX_BATCH_STATUS_LABELS, item.status)}</td>
                  <td style={cellStyle()}>{item.itemIds.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
        <article style={panelStyle()}>
          <h3 style={{ marginTop: 0 }}>批次详情</h3>
          {selectedBatchDetail ? (
            <>
              <p>税种：{selectedBatchDetail.taxType}</p>
              <p>申报期：{selectedBatchDetail.filingPeriod}</p>
              <p>状态：{t(TAX_BATCH_STATUS_LABELS, selectedBatchDetail.status)}</p>
              <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
                <button
                  onClick={() =>
                    void validateTaxFilingBatch(selectedBatchDetail.id).then((result) => {
                      setValidation(result);
                      setMessage(
                        result.valid
                          ? `批次 ${selectedBatchDetail.id} 校验通过。`
                          : `批次 ${selectedBatchDetail.id} 校验未通过。`
                      );
                    })
                  }
                >
                  校验批次
                </button>
                <button
                  onClick={() =>
                    void submitTaxFilingBatch(selectedBatchDetail.id)
                      .then(async () => {
                        await refreshBatches(selectedBatchDetail.id);
                        setMessage(`批次 ${selectedBatchDetail.id} 已提交。`);
                      })
                      .catch((error) => setMessage((error as Error).message))
                  }
                >
                  提交批次
                </button>
                <button
                  onClick={() =>
                    void reviewTaxFilingBatch(selectedBatchDetail.id, reviewForm)
                      .then((detail) => {
                        setSelectedBatchDetail(detail);
                        setMessage(`批次 ${selectedBatchDetail.id} 已完成复核。`);
                        setReviewForm((current) => ({ ...current, reviewNotes: "" }));
                      })
                      .catch((error) => setMessage((error as Error).message))
                  }
                >
                  保存复核
                </button>
                <button
                  onClick={() =>
                    void archiveTaxFilingBatch(selectedBatchDetail.id, archiveForm)
                      .then((detail) => {
                        setSelectedBatchDetail(detail);
                        void refreshBatches(selectedBatchDetail.id);
                        setMessage(`批次 ${selectedBatchDetail.id} 已留档。`);
                        setArchiveForm((current) => ({ ...current, archiveNotes: "" }));
                      })
                      .catch((error) => setMessage((error as Error).message))
                  }
                >
                  留档批次
                </button>
              </div>
              <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                <div style={{ display: "grid", gap: "8px" }}>
                  <select
                    value={reviewForm.reviewResult}
                    onChange={(event) =>
                      setReviewForm((current) => ({
                        ...current,
                        reviewResult: event.target.value as "approved" | "rejected"
                      }))
                    }
                  >
                    <option value="approved">审核通过</option>
                    <option value="rejected">审核驳回</option>
                  </select>
                  <input
                    value={reviewForm.reviewNotes}
                    onChange={(event) => setReviewForm((current) => ({ ...current, reviewNotes: event.target.value }))}
                    placeholder="复核说明"
                  />
                </div>
                <div style={{ display: "grid", gap: "8px" }}>
                  <input
                    value={archiveForm.archiveLabel}
                    onChange={(event) => setArchiveForm((current) => ({ ...current, archiveLabel: event.target.value }))}
                    placeholder="留档标签，如 2026Q2-VAT"
                  />
                  <input
                    value={archiveForm.archiveNotes}
                    onChange={(event) => setArchiveForm((current) => ({ ...current, archiveNotes: event.target.value }))}
                    placeholder="留档说明"
                  />
                </div>
              </section>
              {validation ? (
                <div style={{ marginBottom: "12px" }}>
                  <div>校验结果：{validation.valid ? "通过" : "未通过"}</div>
                  {validation.issues.length ? (
                    <ul style={{ paddingLeft: "22px", lineHeight: 1.8 }}>
                      {validation.issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
              <h4>批次事项</h4>
              <ul style={{ paddingLeft: "22px", lineHeight: 1.8 }}>
                {selectedBatchDetail.items.map((item) => (
                  <li key={item.id}>
                    {item.taxType} | {item.filingPeriod} | {t(TAX_STATUS_LABELS, item.status)} | {item.treatment}
                  </li>
                ))}
              </ul>
              <h4>复核记录</h4>
              {selectedBatchDetail.reviews.length ? (
                <ul style={{ paddingLeft: "22px", lineHeight: 1.8 }}>
                  {selectedBatchDetail.reviews.map((item) => (
                    <li key={item.id}>
                      {item.reviewedAt.slice(0, 10)} | {item.reviewedByName} | {t(REVIEW_RESULT_LABELS, item.reviewResult)} | {item.reviewNotes}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>暂无复核记录。</p>
              )}
              <h4>留档记录</h4>
              {selectedBatchDetail.archives.length ? (
                <ul style={{ paddingLeft: "22px", lineHeight: 1.8 }}>
                  {selectedBatchDetail.archives.map((item) => (
                    <li key={item.id}>
                      {item.archivedAt.slice(0, 10)} | {item.archiveLabel} | {item.archivedByName} | {item.archiveNotes || "—"}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>暂无留档记录。</p>
              )}
            </>
          ) : (
            <p>请选择一个申报批次。</p>
          )}
        </article>
      </section>
      <article style={panelStyle()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ marginTop: 0 }}>增值税底稿</h3>
          <div style={{ display: "flex", gap: "10px" }}>
            <input value={vatFilingPeriod} onChange={(event) => setVatFilingPeriod(event.target.value)} placeholder="申报期" />
            <button
              onClick={() =>
                void getVatWorkingPaper(vatFilingPeriod)
                  .then((payload) => {
                    setVatPaper(payload);
                    setMessage("已生成增值税底稿。");
                  })
                  .catch((error) => setMessage((error as Error).message))
              }
            >
              生成底稿
            </button>
            <button
              onClick={() =>
                void getTaxPrintableHtml("vat", vatFilingPeriod)
                  .then((html) => {
                    const printableWindow = window.open("", "_blank", "noopener,noreferrer");
                    if (!printableWindow) throw new Error("无法打开打印窗口");
                    printableWindow.document.open();
                    printableWindow.document.write(html);
                    printableWindow.document.close();
                    setMessage("已打开增值税底稿打印版。");
                  })
                  .catch((error) => setMessage((error as Error).message))
              }
            >
              打印底稿
            </button>
          </div>
        </div>
        {vatPaper ? (
          <>
            <p>纳税人口径：{vatPaper.taxpayerType}</p>
            <p>申报期：{vatPaper.filingPeriod}</p>
            <p>销项税额：{vatPaper.outputTaxAmount}</p>
            <p>进项税额：{vatPaper.inputTaxAmount}</p>
            <p>简易计税额：{vatPaper.simplifiedTaxAmount}</p>
            <p>应纳增值税：{vatPaper.payableVatAmount}</p>
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
          <p>尚未生成增值税底稿。</p>
        )}
      </article>
      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        <article style={panelStyle()}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ marginTop: 0 }}>个税申报资料</h3>
            <div style={{ display: "flex", gap: "10px" }}>
              <input value={iitFilingPeriod} onChange={(event) => setIitFilingPeriod(event.target.value)} placeholder="申报期" />
              <button
                onClick={() =>
                  void getIndividualIncomeTaxMaterials(iitFilingPeriod)
                    .then((payload) => {
                      setIitMaterials(payload);
                      setMessage("已生成个税申报资料。");
                    })
                    .catch((error) => setMessage((error as Error).message))
                }
              >
                生成个税资料
              </button>
            </div>
          </div>
          {iitMaterials ? (
            <div style={{ lineHeight: 1.8 }}>
              <div>申报期：{iitMaterials.filingPeriod}</div>
              <div>工资事项数：{iitMaterials.payrollEventCount}</div>
              <div>代扣事项数：{iitMaterials.withholdingItemCount}</div>
              <div>工资总额：{iitMaterials.totalPayrollAmount}</div>
              <ul style={{ paddingLeft: "20px" }}>
                {iitMaterials.checklist.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p>尚未生成个税申报资料。</p>
          )}
        </article>
        <article style={panelStyle()}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ marginTop: 0 }}>印花税与附加税事项</h3>
            <div style={{ display: "flex", gap: "10px" }}>
              <input
                value={stampFilingPeriod}
                onChange={(event) => setStampFilingPeriod(event.target.value)}
                placeholder="申报期"
              />
              <button
                onClick={() =>
                  void getStampAndSurtaxSummary(stampFilingPeriod)
                    .then((payload) => {
                      setStampAndSurtax(payload);
                      setMessage("已汇总印花税与附加税事项。");
                    })
                    .catch((error) => setMessage((error as Error).message))
                }
              >
                汇总税务事项
              </button>
            </div>
          </div>
          {stampAndSurtax ? (
            <div style={{ lineHeight: 1.8 }}>
              <div>申报期：{stampAndSurtax.filingPeriod}</div>
              <div>印花税事项数：{stampAndSurtax.stampDutyItems.length}</div>
              <div>附加税事项数：{stampAndSurtax.surtaxItems.length}</div>
              <ul style={{ paddingLeft: "20px" }}>
                {stampAndSurtax.notes.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p>尚未汇总印花税与附加税事项。</p>
          )}
        </article>
      </section>
      <article style={panelStyle()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ marginTop: 0 }}>企业所得税预缴与汇算准备</h3>
          <div style={{ display: "flex", gap: "10px" }}>
            <input value={incomeTaxPeriod} onChange={(event) => setIncomeTaxPeriod(event.target.value)} placeholder="申报期" />
            <button
              onClick={() =>
                void getCorporateIncomeTaxPreparation(incomeTaxPeriod)
                  .then((payload) => {
                    setIncomeTaxPreparation(payload);
                    setMessage("已生成企业所得税预缴与汇算准备。");
                  })
                  .catch((error) => setMessage((error as Error).message))
              }
            >
              生成准备稿
            </button>
            <button
              onClick={() =>
                void getTaxPrintableHtml("corporate_income_tax", incomeTaxPeriod)
                  .then((html) => {
                    const printableWindow = window.open("", "_blank", "noopener,noreferrer");
                    if (!printableWindow) throw new Error("无法打开打印窗口");
                    printableWindow.document.open();
                    printableWindow.document.write(html);
                    printableWindow.document.close();
                    setMessage("已打开企业所得税打印版。");
                  })
                  .catch((error) => setMessage((error as Error).message))
              }
            >
              打印准备稿
            </button>
          </div>
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
            <ul style={{ paddingLeft: "20px" }}>
              {incomeTaxPreparation.checklist.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p>尚未生成企业所得税预缴与汇算准备。</p>
        )}
      </article>
    </section>
  );
}
