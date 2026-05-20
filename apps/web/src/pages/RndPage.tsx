import { useEffect, useState } from "react";
import type { RndProject, RndProjectSummary } from "@finance-taxation/domain-model";

function RndHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: "16px", padding: "28px 32px", maxWidth: "560px", width: "92%", boxShadow: "0 8px 40px rgba(0,0,0,0.2)", maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700 }}>研发项目辅助账 · 业务说明</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "#9aa5b4" }}>✕</button>
        </div>
        <div style={{ display: "grid", gap: "14px", fontSize: "13.5px", lineHeight: 1.75 }}>
          <div style={{ background: "rgba(26,127,90,0.06)", borderRadius: "10px", padding: "14px 16px", border: "1px solid rgba(26,127,90,0.2)" }}>
            <strong>核心目的</strong><br />
            研发辅助账是专为研发项目归集费用的子台账，旨在满足中国税法对<strong>研发费用加计扣除</strong>的归集要求。高新技术企业可按实际研发费用的 75%~100% 额外扣除，显著降低企业所得税负。
          </div>
          <div><strong>主要功能模块</strong>
            <div style={{ marginTop: "8px", display: "grid", gap: "8px" }}>
              {[
                ["费用归集", "按人员、材料、设备、外包等维度录入研发成本，系统自动区分「费用化」（当期扣除）和「资本化」（形成无形资产分期摊销）"],
                ["工时登记", "记录研发人员投入工时，用于计算人工费用分摊比例，是加计扣除合规申报的重要凭证"],
                ["超额扣除测算", "基于已归集费用，系统自动计算可申报的加计扣除基数和建议扣除金额，并生成合规核查清单"],
                ["政策合规检查", "对照现行研发费用加计扣除政策，检查项目归集方式是否符合规定，提示潜在合规风险"]
              ].map(([title, desc]) => (
                <div key={title} style={{ border: "1px solid rgba(20,40,60,0.1)", borderRadius: "8px", padding: "10px 12px" }}>
                  <div style={{ fontWeight: 600, marginBottom: "4px" }}>{title}</div>
                  <div style={{ fontSize: "13px", color: "#4d5d6c" }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: "rgba(255,165,0,0.08)", borderRadius: "8px", padding: "10px 14px", fontSize: "12.5px", color: "#b45309" }}>
            ⚠️ 研发费用会计处理与税务归集口径可能存在差异，建议在年度汇算清缴前由专业人员复核辅助账与总账的一致性。
          </div>
        </div>
      </div>
    </div>
  );
}
import {
  createRndCostLine,
  createRndProject,
  createRndTimeEntry,
  getRndProjectDetail,
  getRndSuperDeductionPackage,
  getRndTrend,
  listRndProjects,
  type RndProjectDetail
} from "../lib/api";
import { useI18n, RND_STATUS_LABELS, COST_TYPE_LABELS, ACCOUNTING_TREATMENT_LABELS } from "../lib/i18n";

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

export function RndPage() {
  const { t } = useI18n();
  const [projects, setProjects] = useState<Array<RndProject & { summary: RndProjectSummary }>>([]);
  const [selectedProject, setSelectedProject] = useState<RndProjectDetail | null>(null);
  const [projectName, setProjectName] = useState("AI 财税系统研发");
  const [message, setMessage] = useState("正在准备研发辅助账。");
  const [showHelp, setShowHelp] = useState(false);
  const [deductionPackage, setDeductionPackage] = useState<{
    eligibleBase: string;
    suggestedDeductionAmount: string;
    checklist: string[];
  } | null>(null);
  const [costForm, setCostForm] = useState({
    costType: "software",
    accountingTreatment: "expensed" as "expensed" | "capitalized",
    amount: "",
    occurredOn: "2026-05-15",
    notes: ""
  });
  const [timeForm, setTimeForm] = useState({
    staffName: "",
    workDate: "2026-05-15",
    hours: "",
    notes: ""
  });
  const [trend, setTrend] = useState<Array<{ month: string; expensed: number; capitalized: number; total: number }>>([]);

  useEffect(() => {
    async function bootstrap() {
      try {
        await refreshProjects();
      } catch (error) {
        setMessage((error as Error).message);
      }
    }
    void bootstrap();
  }, []);

  async function refreshProjects(projectId?: string) {
    const [projectsPayload, trendPayload] = await Promise.all([
      listRndProjects(),
      getRndTrend(12).catch(() => ({ trend: [] }))
    ]);
    setProjects(projectsPayload.items);
    setTrend(trendPayload.trend);
    const target = projectId || projectsPayload.items[0]?.id;
    if (target) {
      setSelectedProject(await getRndProjectDetail(target));
    }
    setMessage(`已加载 ${projectsPayload.total} 个研发项目。`);
  }

  return (
    <section style={{ display: "grid", gap: "20px" }}>
      {showHelp && <RndHelpModal onClose={() => setShowHelp(false)} />}
      <article style={panelStyle()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
          <h2 style={{ margin: 0 }}>研发项目辅助账</h2>
          <button onClick={() => setShowHelp(true)} title="业务说明" style={{ width: "26px", height: "26px", borderRadius: "50%", border: "1.5px solid rgba(79,142,247,0.6)", background: "rgba(79,142,247,0.08)", color: "#4f8ef7", fontWeight: 700, fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>?</button>
        </div>
        <p style={{ margin: "0 0 12px" }}>{message}</p>
        <div style={{ display: "flex", gap: "10px" }}>
          <input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="研发项目名称" style={{ flex: 1 }} />
          <button
            onClick={() =>
              void createRndProject({ name: projectName, capitalizationPolicy: "mixed" })
                .then((project) => refreshProjects(project.id))
                .catch((error) => setMessage((error as Error).message))
            }
          >
            新建研发项目
          </button>
        </div>
      </article>

      <section style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: "20px" }}>
        <article style={panelStyle()}>
          <h3 style={{ marginTop: 0 }}>项目列表</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={cellStyle()}>编号</th>
                <th style={cellStyle()}>项目</th>
                <th style={cellStyle()}>状态</th>
                <th style={cellStyle()}>费用化</th>
                <th style={cellStyle()}>资本化</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id} onClick={() => void getRndProjectDetail(project.id).then(setSelectedProject)} style={{ cursor: "pointer" }}>
                  <td style={cellStyle()}>{project.code}</td>
                  <td style={cellStyle()}>{project.name}</td>
                  <td style={cellStyle()}>{t(RND_STATUS_LABELS, project.status)}</td>
                  <td style={cellStyle()}>{project.summary.expenseAmount}</td>
                  <td style={cellStyle()}>{project.summary.capitalizedAmount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>

        <article style={panelStyle()}>
          <h3 style={{ marginTop: 0 }}>项目详情</h3>
          {selectedProject ? (
            <>
              <p>项目：{selectedProject.name}</p>
              <p>口径：{selectedProject.capitalizationPolicy}</p>
              <p>费用化支出：{selectedProject.summary.expenseAmount}</p>
              <p>资本化支出：{selectedProject.summary.capitalizedAmount}</p>
              <p>工时合计：{selectedProject.summary.totalHours}</p>
              <p>加计扣除可选基数：{selectedProject.summary.superDeductionEligibleBase}</p>
              <p>建议口径：{selectedProject.policyReview.recommendedPolicy}</p>
              {selectedProject.policyReview.conflicts.length ? (
                <div style={{ color: "#b91c1c", lineHeight: 1.8 }}>
                  {selectedProject.policyReview.conflicts.map((item) => (
                    <div key={item}>{item}</div>
                  ))}
                </div>
              ) : null}
              <ul style={{ paddingLeft: "20px", lineHeight: 1.8 }}>
                {selectedProject.policyReview.guidance.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <section style={{ marginTop: "16px", lineHeight: 1.8 }}>
                <h4 style={{ marginTop: 0 }}>政策补贴与研发口径提示</h4>
                <div>
                  <strong>补贴提示</strong>
                  <ul style={{ paddingLeft: "20px" }}>
                    {selectedProject.guidance.subsidyHints.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <strong>口径提示</strong>
                  <ul style={{ paddingLeft: "20px" }}>
                    {selectedProject.guidance.policyHints.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <strong>风险提示</strong>
                  <ul style={{ paddingLeft: "20px", color: "#b91c1c" }}>
                    {selectedProject.guidance.riskHints.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </section>
              <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "20px" }}>
                <div>
                  <h4 style={{ marginTop: 0 }}>新增研发成本</h4>
                  <div style={{ display: "grid", gap: "8px" }}>
                    <select
                      value={costForm.costType}
                      onChange={(event) => setCostForm((current) => ({ ...current, costType: event.target.value }))}
                    >
                      <option value="payroll">{t(COST_TYPE_LABELS, "payroll")}</option>
                      <option value="materials">{t(COST_TYPE_LABELS, "materials")}</option>
                      <option value="service">{t(COST_TYPE_LABELS, "service")}</option>
                      <option value="software">{t(COST_TYPE_LABELS, "software")}</option>
                      <option value="equipment">{t(COST_TYPE_LABELS, "equipment")}</option>
                      <option value="other">{t(COST_TYPE_LABELS, "other")}</option>
                    </select>
                    <select
                      value={costForm.accountingTreatment}
                      onChange={(event) =>
                        setCostForm((current) => ({
                          ...current,
                          accountingTreatment: event.target.value as "expensed" | "capitalized"
                        }))
                      }
                    >
                      <option value="expensed">{t(ACCOUNTING_TREATMENT_LABELS, "expensed")}</option>
                      <option value="capitalized">{t(ACCOUNTING_TREATMENT_LABELS, "capitalized")}</option>
                    </select>
                    <input
                      value={costForm.amount}
                      onChange={(event) => setCostForm((current) => ({ ...current, amount: event.target.value }))}
                      placeholder="金额"
                    />
                    <input
                      value={costForm.occurredOn}
                      onChange={(event) => setCostForm((current) => ({ ...current, occurredOn: event.target.value }))}
                      placeholder="发生日期"
                    />
                    <input
                      value={costForm.notes}
                      onChange={(event) => setCostForm((current) => ({ ...current, notes: event.target.value }))}
                      placeholder="说明"
                    />
                    <button
                      onClick={() =>
                        void createRndCostLine(selectedProject.id, costForm)
                          .then(() => getRndProjectDetail(selectedProject.id))
                          .then((detail) => {
                            setSelectedProject(detail);
                            setDeductionPackage(null);
                            setMessage(`已新增研发成本到项目 ${detail.name}。`);
                            setCostForm((current) => ({ ...current, amount: "", notes: "" }));
                          })
                          .catch((error) => setMessage((error as Error).message))
                      }
                    >
                      保存成本
                    </button>
                  </div>
                </div>
                <div>
                  <h4 style={{ marginTop: 0 }}>新增研发工时</h4>
                  <div style={{ display: "grid", gap: "8px" }}>
                    <input
                      value={timeForm.staffName}
                      onChange={(event) => setTimeForm((current) => ({ ...current, staffName: event.target.value }))}
                      placeholder="人员姓名"
                    />
                    <input
                      value={timeForm.workDate}
                      onChange={(event) => setTimeForm((current) => ({ ...current, workDate: event.target.value }))}
                      placeholder="工作日期"
                    />
                    <input
                      value={timeForm.hours}
                      onChange={(event) => setTimeForm((current) => ({ ...current, hours: event.target.value }))}
                      placeholder="工时"
                    />
                    <input
                      value={timeForm.notes}
                      onChange={(event) => setTimeForm((current) => ({ ...current, notes: event.target.value }))}
                      placeholder="说明"
                    />
                    <button
                      onClick={() =>
                        void createRndTimeEntry(selectedProject.id, timeForm)
                          .then(() => getRndProjectDetail(selectedProject.id))
                          .then((detail) => {
                            setSelectedProject(detail);
                            setDeductionPackage(null);
                            setMessage(`已新增研发工时到项目 ${detail.name}。`);
                            setTimeForm((current) => ({ ...current, staffName: "", hours: "", notes: "" }));
                          })
                          .catch((error) => setMessage((error as Error).message))
                      }
                    >
                      保存工时
                    </button>
                  </div>
                </div>
              </section>
              <section style={{ marginTop: "20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h4 style={{ marginTop: 0, marginBottom: "10px" }}>加计扣除资料包</h4>
                  <button
                    onClick={() =>
                      void getRndSuperDeductionPackage(selectedProject.id)
                        .then((payload) => {
                          setDeductionPackage(payload);
                          setMessage(`已生成项目 ${selectedProject.name} 的加计扣除资料包摘要。`);
                        })
                        .catch((error) => setMessage((error as Error).message))
                    }
                  >
                    生成资料包
                  </button>
                </div>
                {deductionPackage ? (
                  <div style={{ marginBottom: "16px", lineHeight: 1.8 }}>
                    <div>可加计扣除基数：{deductionPackage.eligibleBase}</div>
                    <div>建议扣除额：{deductionPackage.suggestedDeductionAmount}</div>
                    <ul style={{ paddingLeft: "20px" }}>
                      {deductionPackage.checklist.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <h4>成本归集明细</h4>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={cellStyle()}>类型</th>
                      <th style={cellStyle()}>口径</th>
                      <th style={cellStyle()}>金额</th>
                      <th style={cellStyle()}>日期</th>
                      <th style={cellStyle()}>说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedProject.costLines.map((item) => (
                      <tr key={item.id}>
                        <td style={cellStyle()}>{t(COST_TYPE_LABELS, item.costType)}</td>
                        <td style={cellStyle()}>{t(ACCOUNTING_TREATMENT_LABELS, item.accountingTreatment)}</td>
                        <td style={cellStyle()}>{item.amount}</td>
                        <td style={cellStyle()}>{item.occurredOn}</td>
                        <td style={cellStyle()}>{item.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
              <section style={{ marginTop: "20px" }}>
                <h4>工时明细</h4>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={cellStyle()}>人员</th>
                      <th style={cellStyle()}>日期</th>
                      <th style={cellStyle()}>工时</th>
                      <th style={cellStyle()}>说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedProject.timeEntries.map((item) => (
                      <tr key={item.id}>
                        <td style={cellStyle()}>{item.staffName}</td>
                        <td style={cellStyle()}>{item.workDate}</td>
                        <td style={cellStyle()}>{item.hours}</td>
                        <td style={cellStyle()}>{item.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          ) : (
            <p>请选择一个研发项目。</p>
          )}
        </article>
      </section>

      {/* 月度研发支出趋势 */}
      {trend.length > 0 && (
        <article style={panelStyle()}>
          <h3 style={{ marginTop: 0, marginBottom: "16px", fontSize: "15px" }}>月度研发支出趋势（近 12 个月）</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ color: "#6c7a89" }}>
                {["月份", "费用化", "资本化", "合计"].map((h) => (
                  <th key={h} style={{ ...cellStyle(), fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trend.map((row) => (
                <tr key={row.month}>
                  <td style={cellStyle()}>{row.month}</td>
                  <td style={cellStyle()}>¥ {row.expensed.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                  <td style={cellStyle()}>¥ {row.capitalized.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                  <td style={{ ...cellStyle(), fontWeight: 500 }}>¥ {row.total.toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
              <tr style={{ background: "rgba(20,40,60,0.03)" }}>
                <td style={{ ...cellStyle(), fontWeight: 500 }}>合计</td>
                <td style={{ ...cellStyle(), fontWeight: 500 }}>¥ {trend.reduce((s, r) => s + r.expensed, 0).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                <td style={{ ...cellStyle(), fontWeight: 500 }}>¥ {trend.reduce((s, r) => s + r.capitalized, 0).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
                <td style={{ ...cellStyle(), fontWeight: 600 }}>¥ {trend.reduce((s, r) => s + r.total, 0).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}</td>
              </tr>
            </tbody>
          </table>
        </article>
      )}
    </section>
  );
}
