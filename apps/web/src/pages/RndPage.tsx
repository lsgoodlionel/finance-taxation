import { useEffect, useState } from "react";
import type { RndProject, RndProjectSummary } from "@finance-taxation/domain-model";
import {
  createRndCostLine,
  createRndProject,
  createRndTimeEntry,
  getRndProjectDetail,
  getRndSuperDeductionPackage,
  listRndProjects,
  login,
  refreshSession,
  type RndProjectDetail
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

export function RndPage() {
  const [projects, setProjects] = useState<Array<RndProject & { summary: RndProjectSummary }>>([]);
  const [selectedProject, setSelectedProject] = useState<RndProjectDetail | null>(null);
  const [projectName, setProjectName] = useState("AI 财税系统研发");
  const [message, setMessage] = useState("正在准备研发辅助账。");
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

  useEffect(() => {
    async function bootstrap() {
      try {
        await login("chairman", "123456");
        await refreshSession();
        await refreshProjects();
      } catch (error) {
        setMessage((error as Error).message);
      }
    }
    void bootstrap();
  }, []);

  async function refreshProjects(projectId?: string) {
    const payload = await listRndProjects();
    setProjects(payload.items);
    const target = projectId || payload.items[0]?.id;
    if (target) {
      setSelectedProject(await getRndProjectDetail(target));
    }
    setMessage(`已加载 ${payload.total} 个研发项目。`);
  }

  return (
    <section style={{ display: "grid", gap: "20px" }}>
      <article style={panelStyle()}>
        <h2 style={{ marginTop: 0 }}>研发项目辅助账</h2>
        <p>{message}</p>
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
                  <td style={cellStyle()}>{project.status}</td>
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
                      <option value="payroll">payroll</option>
                      <option value="materials">materials</option>
                      <option value="service">service</option>
                      <option value="software">software</option>
                      <option value="equipment">equipment</option>
                      <option value="other">other</option>
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
                      <option value="expensed">expensed</option>
                      <option value="capitalized">capitalized</option>
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
                        <td style={cellStyle()}>{item.costType}</td>
                        <td style={cellStyle()}>{item.accountingTreatment}</td>
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
    </section>
  );
}
