import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import type { Voucher } from "@finance-taxation/domain-model";
import { normalizeDrilldownState } from "./drilldown";

function VoucherHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center"
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff", borderRadius: "16px", padding: "28px 32px",
          maxWidth: "520px", width: "90%", boxShadow: "0 8px 40px rgba(0,0,0,0.2)"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>凭证中心 · 业务关系与操作说明</h3>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "#9aa5b4" }}
          >
            ✕
          </button>
        </div>
        <div style={{ display: "grid", gap: "14px", fontSize: "13.5px", lineHeight: 1.75 }}>
          <div style={{ background: "rgba(79,142,247,0.06)", borderRadius: "10px", padding: "14px 16px", border: "1px solid rgba(79,142,247,0.18)" }}>
            <strong>三个中心的关系</strong><br />
            <strong>任务中心</strong>负责分配执行动作，<strong>单据中心</strong>负责沉淀原始资料和业务单据，<strong>凭证中心</strong>负责把这些业务资料转成正式会计凭证并过账。凭证是三者中最靠后的财务结果层。
          </div>
          <div><strong>标准业务流程</strong>
            <ol style={{ margin: "6px 0 0 18px", padding: 0 }}>
              <li>事项分析后生成待执行任务</li>
              <li>任务执行中补齐发票、回单、审批和附件</li>
              <li>资料齐全后生成凭证草稿</li>
              <li>在本页完成校验、审核、过账</li>
              <li>过账后影响总账、报表和税务处理</li>
            </ol>
          </div>
          <div><strong>本页负责什么</strong>
            <div>凭证中心负责最终会计入账。这里关注的是摘要是否准确、分录是否平衡、科目是否正确、是否具备足够单据依据，以及是否已经可以正式过账。</div>
          </div>
          <div><strong>本页关键操作</strong>
            <div><strong>校验</strong>：自动检查借贷平衡和基础格式。</div>
            <div><strong>审核</strong>：由财务负责人确认业务真实、口径合理、资料充分。</div>
            <div><strong>过账</strong>：把凭证正式写入账簿，影响总账和报表，属于不可逆关键动作。</div>
          </div>
        </div>
        <div style={{
          marginTop: "20px", padding: "12px 14px",
          background: "rgba(255,165,0,0.08)", borderRadius: "8px",
          fontSize: "12.5px", color: "#b45309"
        }}>
          ⚠️ <strong>注意：</strong>如果任务未完成或单据资料不完整，不应直接过账。请先回到任务中心或单据中心补齐依据，再在本页完成审核与过账。
        </div>
      </div>
    </div>
  );
}

import {
  approveVoucher,
  createVoucherFromTemplate,
  getVoucherDetail,
  listVouchers,
  listVoucherTemplates,
  postVoucher,
  updateVoucher,
  type VoucherDetail,
  type VoucherTemplate,
  validateVoucher
} from "../lib/api";
import { useI18n, VOUCHER_STATUS_LABELS, VOUCHER_TYPE_LABELS } from "../lib/i18n";
import { ProcessFlowStageSection } from "../features/process-flow/ProcessFlowStageSection";
import { resolveProcessFlowContext } from "../features/process-flow/resolve";

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

export function VouchersPage() {
  const { t } = useI18n();
  const location = useLocation();
  const navState = normalizeDrilldownState(location.state);
  const navEventId = navState.businessEventId ?? null;
  const navVoucherId = navState.voucherId ?? null;
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [selectedVoucherId, setSelectedVoucherId] = useState<string | null>(null);
  const [detail, setDetail] = useState<VoucherDetail | null>(null);
  const [validation, setValidation] = useState<{
    valid: boolean;
    totals: { debit: string; credit: string };
    issues: string[];
  } | null>(null);
  const [message, setMessage] = useState("正在准备凭证数据。");
  const [showHelp, setShowHelp] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [templates, setTemplates] = useState<VoucherTemplate[]>([]);
  const [templateForm, setTemplateForm] = useState({
    templateKey: "sales",
    amount: "",
    businessEventId: "",
    summary: ""
  });

  useEffect(() => {
    async function bootstrap() {
      try {
        const [payload, templatePayload] = await Promise.all([
          listVouchers(),
          listVoucherTemplates()
        ]);
        setVouchers(payload.items);
        setTemplates(templatePayload.items);
        // If navigated from a flow node, prefer the voucher linked to that event
        const linkedId = navVoucherId
          ? payload.items.find((v) => v.id === navVoucherId)?.id ?? null
          : navEventId
          ? payload.items.find((v) => v.businessEventId === navEventId)?.id ?? null
          : null;
        const targetId = linkedId ?? payload.items[0]?.id ?? null;
        setSelectedVoucherId(targetId);
        if (targetId) {
          const firstDetail = await getVoucherDetail(targetId);
          setDetail(firstDetail);
          setSummaryDraft(firstDetail.summary);
          setTemplateForm((current) => ({
            ...current,
            businessEventId: firstDetail.businessEventId || navEventId || current.businessEventId
          }));
        } else if (navEventId) {
          // No existing voucher for this event — pre-fill form for creating one
          setTemplateForm((current) => ({ ...current, businessEventId: navEventId }));
        }
        setMessage(`已加载 ${payload.total} 个凭证对象和 ${templatePayload.total} 个模板。`);
      } catch (error) {
        setMessage((error as Error).message);
      }
    }
    void bootstrap();
  }, [navEventId, navVoucherId]);

  async function refreshVoucherState(voucherId?: string) {
    const payload = await listVouchers();
    setVouchers(payload.items);
    const targetId = voucherId || selectedVoucherId || payload.items[0]?.id || null;
    setSelectedVoucherId(targetId);
    if (targetId) {
      const nextDetail = await getVoucherDetail(targetId);
      setDetail(nextDetail);
      setSummaryDraft(nextDetail.summary);
      setTemplateForm((current) => ({
        ...current,
        businessEventId: nextDetail.businessEventId
      }));
    }
  }

  const voucherFlowContext = useMemo(() => {
    if (!detail) {
      return null;
    }

    return resolveProcessFlowContext({
      event: {
        id: detail.businessEventId || detail.id,
        type: "general",
        title: detail.summary,
        status: detail.status
      },
      detail: {
        tasks: [{ id: `${detail.id}-task-stage` }],
        generatedDocuments: [{ id: `${detail.businessEventId || detail.id}-document-stage` }],
        vouchers: [{ id: detail.id }],
        taxItems: [],
        hasArchivedArtifacts: Boolean(detail.postedAt)
      }
    });
  }, [detail]);

  return (
    <section style={{ display: "grid", gap: "20px" }}>
      {showHelp && <VoucherHelpModal onClose={() => setShowHelp(false)} />}
      <article style={panelStyle()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
          <h2 style={{ margin: 0 }}>凭证中心</h2>
          <button onClick={() => setShowHelp(true)} title="业务说明" style={{ width: "26px", height: "26px", borderRadius: "50%", border: "1.5px solid rgba(79,142,247,0.6)", background: "rgba(79,142,247,0.08)", color: "#4f8ef7", fontWeight: 700, fontSize: "13px", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>?</button>
        </div>
        <p style={{ lineHeight: 1.8, marginTop: 0 }}>{message}</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: "10px", marginTop: "16px" }}>
          <select
            value={templateForm.templateKey}
            onChange={(event) =>
              setTemplateForm((current) => ({ ...current, templateKey: event.target.value }))
            }
          >
            {templates.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
          <input
            placeholder="关联事项编号"
            value={templateForm.businessEventId}
            onChange={(event) =>
              setTemplateForm((current) => ({ ...current, businessEventId: event.target.value }))
            }
          />
          <input
            placeholder="金额"
            value={templateForm.amount}
            onChange={(event) =>
              setTemplateForm((current) => ({ ...current, amount: event.target.value }))
            }
          />
          <input
            placeholder="摘要（可选）"
            value={templateForm.summary}
            onChange={(event) =>
              setTemplateForm((current) => ({ ...current, summary: event.target.value }))
            }
          />
          <button
            onClick={() =>
              void createVoucherFromTemplate(templateForm)
                .then(async (created) => {
                  await refreshVoucherState(created.id);
                  setMessage(`已按模板 ${templateForm.templateKey} 生成凭证 ${created.id}。`);
                  setTemplateForm((current) => ({ ...current, amount: "", summary: "" }));
                })
                .catch((error) => setMessage((error as Error).message))
            }
          >
            模板生成
          </button>
        </div>
      </article>
      {detail && (
        <ProcessFlowStageSection
          title="凭证阶段流程回看"
          subtitle="当前页定位到凭证处理或归档节点。若当前凭证已关联事项，则会尽量使用该事项上下文高亮分支。"
          currentNodeId={voucherFlowContext?.currentNodeId ?? "voucher_tax_processing"}
          branch={voucherFlowContext?.branch}
          businessEventId={detail.businessEventId}
        />
      )}
      <section style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: "20px" }}>
        <article style={panelStyle()}>
          <h3 style={{ marginTop: 0 }}>凭证对象</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={cellStyle()}>编号</th>
                <th style={cellStyle()}>摘要</th>
                <th style={cellStyle()}>状态</th>
                <th style={cellStyle()}>业务事项</th>
              </tr>
            </thead>
            <tbody>
              {vouchers.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => {
                    setSelectedVoucherId(item.id);
                    setValidation(null);
                    void getVoucherDetail(item.id).then((payload) => {
                      setDetail(payload);
                      setSummaryDraft(payload.summary);
                    });
                  }}
                  style={{
                    cursor: "pointer",
                    background: item.id === selectedVoucherId ? "rgba(30,42,55,0.06)" : "transparent"
                  }}
                >
                  <td style={cellStyle()}>{item.id}</td>
                  <td style={cellStyle()}>{item.summary}</td>
                  <td style={cellStyle()}>{t(VOUCHER_STATUS_LABELS, item.status)}</td>
                  <td style={cellStyle()}>{item.businessEventId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
        <article style={panelStyle()}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h3 style={{ margin: 0 }}>凭证详情</h3>
            <button
              onClick={() => setShowHelp(true)}
              title="操作说明"
              style={{
                width: "26px", height: "26px", borderRadius: "50%",
                border: "1.5px solid rgba(79,142,247,0.6)",
                background: "rgba(79,142,247,0.08)", color: "#4f8ef7",
                fontWeight: 700, fontSize: "13px", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
              }}
            >?</button>
          </div>
          {detail ? (
            <>
              {/* ── 记账凭证正式格式 ── */}
              <div style={{
                border: "1.5px solid rgba(20,40,60,0.18)", borderRadius: "10px",
                padding: "18px 20px", background: "#fff", marginBottom: "14px"
              }}>
                {/* 凭证头部 */}
                <div style={{ textAlign: "center", marginBottom: "12px" }}>
                  <div style={{ fontSize: "16px", fontWeight: 700, letterSpacing: "3px" }}>记 账 凭 证</div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12.5px", color: "#4d5d6c", marginBottom: "12px" }}>
                  <span>日期：{detail.createdAt?.slice(0, 10) ?? "—"}</span>
                  <span>凭证编号：{detail.id.slice(-8).toUpperCase()}</span>
                  <span>类型：{t(VOUCHER_TYPE_LABELS, detail.voucherType)}</span>
                  <span>状态：{t(VOUCHER_STATUS_LABELS, detail.status)}</span>
                </div>

                {/* 分录表格 */}
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ background: "rgba(20,40,60,0.04)" }}>
                      {["摘　要", "科目编码", "会计科目", "借方金额", "贷方金额"].map((h) => (
                        <th key={h} style={{
                          border: "1px solid rgba(20,40,60,0.15)", padding: "7px 10px",
                          textAlign: h.includes("金额") ? "right" : "left", fontWeight: 600, fontSize: "12.5px"
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((line) => (
                      <tr key={line.id}>
                        <td style={{ border: "1px solid rgba(20,40,60,0.1)", padding: "7px 10px" }}>{line.summary || detail.summary}</td>
                        <td style={{ border: "1px solid rgba(20,40,60,0.1)", padding: "7px 10px", color: "#4d5d6c" }}>{line.accountCode}</td>
                        <td style={{ border: "1px solid rgba(20,40,60,0.1)", padding: "7px 10px" }}>{line.accountName}</td>
                        <td style={{ border: "1px solid rgba(20,40,60,0.1)", padding: "7px 10px", textAlign: "right", fontFamily: "monospace" }}>
                          {Number(line.debit) > 0 ? Number(line.debit).toFixed(2) : ""}
                        </td>
                        <td style={{ border: "1px solid rgba(20,40,60,0.1)", padding: "7px 10px", textAlign: "right", fontFamily: "monospace" }}>
                          {Number(line.credit) > 0 ? Number(line.credit).toFixed(2) : ""}
                        </td>
                      </tr>
                    ))}
                    {/* 合计行 */}
                    {(() => {
                      const totalDebit = detail.lines.reduce((s, l) => s + Number(l.debit), 0);
                      const totalCredit = detail.lines.reduce((s, l) => s + Number(l.credit), 0);
                      return (
                        <tr style={{ background: "rgba(20,40,60,0.03)", fontWeight: 600 }}>
                          <td colSpan={3} style={{ border: "1px solid rgba(20,40,60,0.15)", padding: "7px 10px", fontSize: "12.5px" }}>合　计</td>
                          <td style={{ border: "1px solid rgba(20,40,60,0.15)", padding: "7px 10px", textAlign: "right", fontFamily: "monospace" }}>
                            {totalDebit.toFixed(2)}
                          </td>
                          <td style={{ border: "1px solid rgba(20,40,60,0.15)", padding: "7px 10px", textAlign: "right", fontFamily: "monospace" }}>
                            {totalCredit.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>

                {/* 凭证脚注 */}
                <div style={{ display: "flex", gap: "24px", marginTop: "12px", fontSize: "12px", color: "#6c7a89", borderTop: "1px solid rgba(20,40,60,0.08)", paddingTop: "10px" }}>
                  <span>制单人：{detail.postingRecords[0]?.postedByName ?? "—"}</span>
                  <span>审核日期：{detail.approvedAt?.slice(0, 10) ?? "—"}</span>
                  <span>过账日期：{detail.postedAt?.slice(0, 10) ?? "—"}</span>
                  <span>关联事项：{detail.businessEventId}</span>
                </div>
              </div>

              {/* 校验结果提示 */}
              {validation && (
                <div style={{
                  marginBottom: "12px", padding: "10px 14px", borderRadius: "8px", fontSize: "13px",
                  background: validation.valid ? "rgba(21,128,61,0.06)" : "rgba(220,38,38,0.06)",
                  border: `1px solid ${validation.valid ? "rgba(21,128,61,0.2)" : "rgba(220,38,38,0.2)"}`,
                  color: validation.valid ? "#15803d" : "#dc2626"
                }}>
                  {validation.valid ? "✓ 借贷平衡" : "✗ 借贷不平衡"}
                  　借方合计 {validation.totals.debit}　贷方合计 {validation.totals.credit}
                  {validation.issues.length > 0 && (
                    <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
                      {validation.issues.map((issue) => <li key={issue}>{issue}</li>)}
                    </ul>
                  )}
                </div>
              )}

              {/* 操作按钮区 */}
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", marginBottom: "12px" }}>
                <input
                  value={summaryDraft}
                  onChange={(event) => setSummaryDraft(event.target.value)}
                  style={{ flex: 1, minWidth: "120px", padding: "6px 10px", borderRadius: "6px", border: "1px solid rgba(20,40,60,0.15)", fontSize: "13px" }}
                  placeholder="摘要"
                />
                <button
                  onClick={() => void updateVoucher(detail.id, { summary: summaryDraft }).then(async () => { await refreshVoucherState(detail.id); setMessage(`凭证摘要已更新。`); }).catch((e) => setMessage((e as Error).message))}
                  style={{ padding: "6px 14px", borderRadius: "6px", border: "1px solid rgba(20,40,60,0.15)", cursor: "pointer", fontSize: "13px" }}
                >更新摘要</button>
                <button
                  onClick={() => void validateVoucher(detail.id).then((r) => { setValidation(r); setMessage(r.valid ? "凭证校验通过" : "凭证校验未通过"); })}
                  style={{ padding: "6px 14px", borderRadius: "6px", border: "1px solid rgba(20,40,60,0.15)", cursor: "pointer", fontSize: "13px", display: "flex", alignItems: "center", gap: "4px" }}
                >🔍 校验</button>
                <button
                  onClick={() => void approveVoucher(detail.id).then(async () => { await refreshVoucherState(detail.id); setMessage(`凭证已审核。`); }).catch((e) => setMessage((e as Error).message))}
                  style={{ padding: "6px 14px", borderRadius: "6px", border: "1px solid rgba(21,128,61,0.3)", background: "rgba(21,128,61,0.06)", color: "#15803d", cursor: "pointer", fontSize: "13px" }}
                >✅ 审核</button>
                <button
                  onClick={() => void postVoucher(detail.id).then(async () => { await refreshVoucherState(detail.id); setMessage(`凭证已过账。`); }).catch((e) => setMessage((e as Error).message))}
                  style={{ padding: "6px 14px", borderRadius: "6px", border: "1px solid rgba(37,99,235,0.3)", background: "rgba(37,99,235,0.06)", color: "#1d4ed8", cursor: "pointer", fontSize: "13px" }}
                >📒 过账</button>
              </div>
            </>
          ) : (
            <p style={{ color: "#9aa5b4", textAlign: "center", padding: "40px 0" }}>请选择一张凭证</p>
          )}
        </article>
      </section>
    </section>
  );
}
