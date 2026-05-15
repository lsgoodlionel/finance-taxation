import { useEffect, useState } from "react";
import type { Employee, PayrollPolicy, PayrollRecord, PayrollPeriodSummary } from "@finance-taxation/domain-model";
import {
  computePayroll,
  confirmPayroll,
  createEmployee,
  getPayrollPeriods,
  getPayrollPolicy,
  listEmployees,
  listPayroll,
  login,
  refreshSession,
  updateEmployee,
  updatePayrollPolicy
} from "../lib/api";

type Tab = "employees" | "payroll" | "policy";

const EMPLOYEE_STATUS_LABELS: Record<string, string> = {
  active: "在职",
  on_leave: "休假",
  resigned: "已离职"
};

const PAYROLL_STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  confirmed: "已确认"
};

const PAYROLL_STATUS_COLOR: Record<string, string> = {
  draft: "#8a9bb0",
  confirmed: "#1a7f5a"
};

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

function btnPrimary() {
  return {
    background: "#1e2a37", color: "#fff", border: "none",
    borderRadius: "8px", padding: "8px 18px", cursor: "pointer", fontSize: "13px"
  } as const;
}

function btnSecondary() {
  return {
    background: "#eef0f3", color: "#1e2a37", border: "none",
    borderRadius: "8px", padding: "8px 14px", cursor: "pointer", fontSize: "13px"
  } as const;
}

function fmt(n: number) {
  return n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

const EMPTY_EMP_FORM = {
  name: "", idCard: "", position: "", hireDate: "", baseSalary: "", notes: ""
};

export function PayrollPage() {
  const [tab, setTab] = useState<Tab>("employees");
  const [message, setMessage] = useState("正在加载数据...");

  // employees tab
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showEmpForm, setShowEmpForm] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [empForm, setEmpForm] = useState({ ...EMPTY_EMP_FORM });

  // payroll tab
  const [periods, setPeriods] = useState<PayrollPeriodSummary[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [customPeriod, setCustomPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
  const [computing, setComputing] = useState(false);

  // policy tab
  const [policy, setPolicy] = useState<PayrollPolicy | null>(null);
  const [policyForm, setPolicyForm] = useState<Record<string, string>>({});
  const [editingPolicy, setEditingPolicy] = useState(false);

  useEffect(() => {
    async function bootstrap() {
      try {
        await login("chairman", "123456");
        await refreshSession();
        await loadAll();
      } catch {
        setMessage("加载失败，请检查后端连接。");
      }
    }
    bootstrap();
  }, []);

  async function loadAll() {
    const [empRes, perRes, polRes] = await Promise.all([
      listEmployees(),
      getPayrollPeriods(),
      getPayrollPolicy()
    ]);
    setEmployees(empRes.items);
    setPeriods(perRes.items);
    setPolicy(polRes.policy);
    setPolicyForm(policyToForm(polRes.policy));
    setMessage(`已加载 ${empRes.total} 名员工，${perRes.total} 个工资期。`);
  }

  function policyToForm(p: PayrollPolicy): Record<string, string> {
    return {
      socialSecurityBaseMin: String(p.socialSecurityBaseMin),
      socialSecurityBaseMax: String(p.socialSecurityBaseMax),
      pensionEmployeeRate: String(p.pensionEmployeeRate),
      pensionEmployerRate: String(p.pensionEmployerRate),
      medicalEmployeeRate: String(p.medicalEmployeeRate),
      medicalEmployerRate: String(p.medicalEmployerRate),
      unemploymentEmployeeRate: String(p.unemploymentEmployeeRate),
      unemploymentEmployerRate: String(p.unemploymentEmployerRate),
      housingFundEmployeeRate: String(p.housingFundEmployeeRate),
      housingFundEmployerRate: String(p.housingFundEmployerRate),
      iitThreshold: String(p.iitThreshold)
    };
  }

  async function handleCreateEmployee() {
    if (!empForm.name) { setMessage("姓名不能为空"); return; }
    const baseSalary = Number(empForm.baseSalary);
    if (isNaN(baseSalary) || baseSalary < 0) { setMessage("基本工资格式不正确"); return; }
    await createEmployee({
      name: empForm.name,
      idCard: empForm.idCard || undefined,
      position: empForm.position || undefined,
      hireDate: empForm.hireDate || undefined,
      baseSalary,
      notes: empForm.notes || undefined
    });
    setShowEmpForm(false);
    setEmpForm({ ...EMPTY_EMP_FORM });
    const res = await listEmployees();
    setEmployees(res.items);
    setMessage("员工已添加。");
  }

  async function handleUpdateEmployee() {
    if (!editingEmp) return;
    const baseSalary = Number(empForm.baseSalary);
    if (isNaN(baseSalary) || baseSalary < 0) { setMessage("基本工资格式不正确"); return; }
    await updateEmployee(editingEmp.id, {
      name: empForm.name,
      idCard: empForm.idCard,
      position: empForm.position,
      hireDate: empForm.hireDate || undefined,
      baseSalary
    });
    setEditingEmp(null);
    setEmpForm({ ...EMPTY_EMP_FORM });
    const res = await listEmployees();
    setEmployees(res.items);
    setMessage("员工信息已更新。");
  }

  function startEditEmployee(emp: Employee) {
    setEditingEmp(emp);
    setEmpForm({
      name: emp.name,
      idCard: emp.idCard,
      position: emp.position,
      hireDate: emp.hireDate ?? "",
      baseSalary: String(emp.baseSalary),
      notes: emp.notes
    });
    setShowEmpForm(false);
  }

  async function handleComputePayroll() {
    const period = customPeriod;
    if (!period) { setMessage("请输入工资期间（格式：YYYY-MM）"); return; }
    setComputing(true);
    try {
      await computePayroll(period);
      setSelectedPeriod(period);
      const res = await listPayroll(period);
      setPayrollRecords(res.items);
      const perRes = await getPayrollPeriods();
      setPeriods(perRes.items);
      setMessage(`已计算 ${res.total} 条工资记录，期间：${period}。`);
    } finally {
      setComputing(false);
    }
  }

  async function handleLoadPeriod(period: string) {
    setSelectedPeriod(period);
    const res = await listPayroll(period);
    setPayrollRecords(res.items);
    setMessage(`已加载 ${period} 工资数据，共 ${res.total} 条。`);
  }

  async function handleConfirm(recordId: string) {
    await confirmPayroll(recordId);
    if (selectedPeriod) {
      const res = await listPayroll(selectedPeriod);
      setPayrollRecords(res.items);
    }
    setMessage("工资记录已确认。");
  }

  async function handleSavePolicy() {
    const updates: Record<string, number> = {};
    for (const [k, v] of Object.entries(policyForm)) {
      const n = Number(v);
      if (!isNaN(n)) updates[k] = n;
    }
    const res = await updatePayrollPolicy(updates);
    setPolicy(res.policy);
    setPolicyForm(policyToForm(res.policy));
    setEditingPolicy(false);
    setMessage("参数设置已保存。");
  }

  const tabStyle = (t: Tab) => ({
    padding: "8px 20px",
    borderRadius: "8px",
    border: "none",
    cursor: "pointer",
    fontSize: "14px",
    background: tab === t ? "#1e2a37" : "rgba(255,255,255,0.72)",
    color: tab === t ? "#fff" : "#1e2a37"
  } as const);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: "22px" }}>工资管理</h2>
          <div style={{ color: "#6c7a89", fontSize: "13px" }}>{message}</div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button style={tabStyle("employees")} onClick={() => setTab("employees")}>员工管理</button>
          <button style={tabStyle("payroll")} onClick={() => setTab("payroll")}>工资计算</button>
          <button style={tabStyle("policy")} onClick={() => setTab("policy")}>参数设置</button>
        </div>
      </div>

      {/* ── Tab: 员工管理 ── */}
      {tab === "employees" && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button style={btnPrimary()} onClick={() => { setShowEmpForm(!showEmpForm); setEditingEmp(null); setEmpForm({ ...EMPTY_EMP_FORM }); }}>
              + 添加员工
            </button>
          </div>

          {(showEmpForm || editingEmp) && (
            <div style={panelStyle()}>
              <h3 style={{ margin: "0 0 16px", fontSize: "16px" }}>
                {editingEmp ? `编辑员工：${editingEmp.name}` : "添加员工"}
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                {[
                  { label: "姓名*", key: "name", type: "text" },
                  { label: "身份证号", key: "idCard", type: "text" },
                  { label: "职位", key: "position", type: "text" },
                  { label: "入职日期", key: "hireDate", type: "date" },
                  { label: "基本工资（元）*", key: "baseSalary", type: "number" }
                ].map(({ label, key, type }) => (
                  <label key={key} style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px" }}>
                    <span style={{ color: "#6c7a89" }}>{label}</span>
                    <input
                      type={type}
                      value={empForm[key as keyof typeof empForm]}
                      onChange={(e) => setEmpForm({ ...empForm, [key]: e.target.value })}
                      style={{ padding: "8px", borderRadius: "6px", border: "1px solid #dce3ea", fontSize: "13px" }}
                    />
                  </label>
                ))}
                <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px", gridColumn: "1 / -1" }}>
                  <span style={{ color: "#6c7a89" }}>备注</span>
                  <input
                    type="text"
                    value={empForm.notes}
                    onChange={(e) => setEmpForm({ ...empForm, notes: e.target.value })}
                    style={{ padding: "8px", borderRadius: "6px", border: "1px solid #dce3ea", fontSize: "13px" }}
                  />
                </label>
              </div>
              <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
                <button style={btnPrimary()} onClick={editingEmp ? handleUpdateEmployee : handleCreateEmployee}>
                  {editingEmp ? "保存修改" : "确认添加"}
                </button>
                <button style={btnSecondary()} onClick={() => { setShowEmpForm(false); setEditingEmp(null); }}>
                  取消
                </button>
              </div>
            </div>
          )}

          <div style={panelStyle()}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ color: "#6c7a89" }}>
                  {["姓名", "职位", "入职日期", "基本工资", "状态", "操作"].map((h) => (
                    <th key={h} style={{ ...cellStyle(), fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ ...cellStyle(), color: "#aab5c0", textAlign: "center", padding: "32px" }}>
                      暂无员工数据，点击"添加员工"开始录入
                    </td>
                  </tr>
                ) : (
                  employees.map((emp) => (
                    <tr key={emp.id}>
                      <td style={cellStyle()}>
                        <div>{emp.name}</div>
                        <div style={{ color: "#8a9bb0", fontSize: "11px" }}>{emp.idCard}</div>
                      </td>
                      <td style={cellStyle()}>{emp.position || "—"}</td>
                      <td style={cellStyle()}>{emp.hireDate ?? "—"}</td>
                      <td style={cellStyle()}>¥ {fmt(emp.baseSalary)}</td>
                      <td style={cellStyle()}>
                        <span style={{
                          background: emp.status === "active" ? "#1a7f5a22" : "#8a9bb022",
                          color: emp.status === "active" ? "#1a7f5a" : "#8a9bb0",
                          borderRadius: "999px", padding: "2px 10px", fontSize: "12px"
                        }}>
                          {EMPLOYEE_STATUS_LABELS[emp.status] ?? emp.status}
                        </span>
                      </td>
                      <td style={cellStyle()}>
                        <button
                          onClick={() => startEditEmployee(emp)}
                          style={{ fontSize: "12px", padding: "3px 10px", borderRadius: "6px", border: "1px solid #1e2a37", color: "#1e2a37", background: "none", cursor: "pointer" }}
                        >
                          编辑
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Tab: 工资计算 ── */}
      {tab === "payroll" && (
        <>
          <div style={panelStyle()}>
            <h3 style={{ margin: "0 0 16px", fontSize: "15px" }}>计算工资</h3>
            <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px" }}>
                <span style={{ color: "#6c7a89" }}>工资期间（YYYY-MM）</span>
                <input
                  type="month"
                  value={customPeriod}
                  onChange={(e) => setCustomPeriod(e.target.value)}
                  style={{ padding: "8px", borderRadius: "6px", border: "1px solid #dce3ea", fontSize: "13px" }}
                />
              </label>
              <button
                style={{ ...btnPrimary(), opacity: computing ? 0.6 : 1 }}
                onClick={handleComputePayroll}
                disabled={computing}
              >
                {computing ? "计算中..." : "计算/更新工资"}
              </button>
            </div>
          </div>

          {periods.length > 0 && (
            <div style={panelStyle()}>
              <h3 style={{ margin: "0 0 12px", fontSize: "15px" }}>历史期间</h3>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {periods.map((p) => (
                  <button
                    key={p.period}
                    onClick={() => handleLoadPeriod(p.period)}
                    style={{
                      padding: "6px 14px", borderRadius: "8px", fontSize: "13px", cursor: "pointer",
                      background: selectedPeriod === p.period ? "#1e2a37" : "rgba(255,255,255,0.8)",
                      color: selectedPeriod === p.period ? "#fff" : "#1e2a37",
                      border: "1px solid rgba(20,40,60,0.12)"
                    }}
                  >
                    {p.period}
                    <span style={{ marginLeft: "6px", fontSize: "11px", opacity: 0.7 }}>
                      {p.headcount}人 | ¥{fmt(p.totalNetPay)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedPeriod && payrollRecords.length > 0 && (
            <div style={panelStyle()}>
              <h3 style={{ margin: "0 0 12px", fontSize: "15px" }}>
                {selectedPeriod} 工资明细（{payrollRecords.length} 人）
              </h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", minWidth: "900px" }}>
                  <thead>
                    <tr style={{ color: "#6c7a89" }}>
                      {["姓名", "应发工资", "个人社保", "单位社保", "个人公积金", "单位公积金", "个税", "实发工资", "状态", "操作"].map((h) => (
                        <th key={h} style={{ ...cellStyle(), fontWeight: 500, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {payrollRecords.map((r) => (
                      <tr key={r.id}>
                        <td style={cellStyle()}>{r.employeeName}</td>
                        <td style={cellStyle()}>¥{fmt(r.grossSalary)}</td>
                        <td style={cellStyle()}>¥{fmt(r.socialSecurityEmployee)}</td>
                        <td style={cellStyle()}>¥{fmt(r.socialSecurityEmployer)}</td>
                        <td style={cellStyle()}>¥{fmt(r.housingFundEmployee)}</td>
                        <td style={cellStyle()}>¥{fmt(r.housingFundEmployer)}</td>
                        <td style={cellStyle()}>¥{fmt(r.iitWithheld)}</td>
                        <td style={{ ...cellStyle(), fontWeight: 600 }}>¥{fmt(r.netPay)}</td>
                        <td style={cellStyle()}>
                          <span style={{
                            background: `${PAYROLL_STATUS_COLOR[r.status]}22`,
                            color: PAYROLL_STATUS_COLOR[r.status],
                            borderRadius: "999px", padding: "2px 8px", fontSize: "11px"
                          }}>
                            {PAYROLL_STATUS_LABELS[r.status] ?? r.status}
                          </span>
                        </td>
                        <td style={cellStyle()}>
                          {r.status === "draft" && (
                            <button
                              onClick={() => handleConfirm(r.id)}
                              style={{ fontSize: "11px", padding: "3px 10px", borderRadius: "6px", border: "1px solid #1a7f5a", color: "#1a7f5a", background: "none", cursor: "pointer" }}
                            >
                              确认
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: "rgba(30,42,55,0.04)", fontWeight: 600, fontSize: "13px" }}>
                      <td style={{ ...cellStyle(), borderTop: "2px solid rgba(20,40,60,0.12)" }}>合计</td>
                      <td style={{ ...cellStyle(), borderTop: "2px solid rgba(20,40,60,0.12)" }}>
                        ¥{fmt(payrollRecords.reduce((s, r) => s + r.grossSalary, 0))}
                      </td>
                      <td style={{ ...cellStyle(), borderTop: "2px solid rgba(20,40,60,0.12)" }}>
                        ¥{fmt(payrollRecords.reduce((s, r) => s + r.socialSecurityEmployee, 0))}
                      </td>
                      <td style={{ ...cellStyle(), borderTop: "2px solid rgba(20,40,60,0.12)" }}>
                        ¥{fmt(payrollRecords.reduce((s, r) => s + r.socialSecurityEmployer, 0))}
                      </td>
                      <td style={{ ...cellStyle(), borderTop: "2px solid rgba(20,40,60,0.12)" }}>
                        ¥{fmt(payrollRecords.reduce((s, r) => s + r.housingFundEmployee, 0))}
                      </td>
                      <td style={{ ...cellStyle(), borderTop: "2px solid rgba(20,40,60,0.12)" }}>
                        ¥{fmt(payrollRecords.reduce((s, r) => s + r.housingFundEmployer, 0))}
                      </td>
                      <td style={{ ...cellStyle(), borderTop: "2px solid rgba(20,40,60,0.12)" }}>
                        ¥{fmt(payrollRecords.reduce((s, r) => s + r.iitWithheld, 0))}
                      </td>
                      <td style={{ ...cellStyle(), borderTop: "2px solid rgba(20,40,60,0.12)" }}>
                        ¥{fmt(payrollRecords.reduce((s, r) => s + r.netPay, 0))}
                      </td>
                      <td colSpan={2} style={{ ...cellStyle(), borderTop: "2px solid rgba(20,40,60,0.12)" }} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {selectedPeriod && payrollRecords.length === 0 && (
            <div style={{ ...panelStyle(), color: "#aab5c0", textAlign: "center", padding: "40px" }}>
              {selectedPeriod} 暂无工资数据，请先点击"计算/更新工资"生成记录。
            </div>
          )}
        </>
      )}

      {/* ── Tab: 参数设置 ── */}
      {tab === "policy" && policy && (
        <div style={panelStyle()}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <h3 style={{ margin: 0, fontSize: "16px" }}>社保/公积金/个税参数</h3>
            {!editingPolicy ? (
              <button style={btnPrimary()} onClick={() => setEditingPolicy(true)}>编辑参数</button>
            ) : (
              <div style={{ display: "flex", gap: "8px" }}>
                <button style={btnPrimary()} onClick={handleSavePolicy}>保存</button>
                <button style={btnSecondary()} onClick={() => { setEditingPolicy(false); setPolicyForm(policyToForm(policy)); }}>取消</button>
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px 40px" }}>
            {[
              { label: "社保基数下限（元）", key: "socialSecurityBaseMin" },
              { label: "社保基数上限（元）", key: "socialSecurityBaseMax" },
              { label: "养老保险 个人费率", key: "pensionEmployeeRate" },
              { label: "养老保险 单位费率", key: "pensionEmployerRate" },
              { label: "医疗保险 个人费率", key: "medicalEmployeeRate" },
              { label: "医疗保险 单位费率", key: "medicalEmployerRate" },
              { label: "失业保险 个人费率", key: "unemploymentEmployeeRate" },
              { label: "失业保险 单位费率", key: "unemploymentEmployerRate" },
              { label: "住房公积金 个人费率", key: "housingFundEmployeeRate" },
              { label: "住房公积金 单位费率", key: "housingFundEmployerRate" },
              { label: "个税起征点（元）", key: "iitThreshold" }
            ].map(({ label, key }) => {
              const isRate = key.endsWith("Rate");
              const raw = Number(policyForm[key] ?? 0);
              const display = editingPolicy ? policyForm[key] : (isRate ? pct(raw) : fmt(raw));
              return (
                <div key={key} style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "13px" }}>
                  <span style={{ color: "#6c7a89" }}>{label}</span>
                  {editingPolicy ? (
                    <input
                      type="number"
                      value={policyForm[key]}
                      step={isRate ? "0.001" : "100"}
                      onChange={(e) => setPolicyForm({ ...policyForm, [key]: e.target.value })}
                      style={{ padding: "7px", borderRadius: "6px", border: "1px solid #dce3ea", fontSize: "13px", width: "120px" }}
                    />
                  ) : (
                    <span style={{ fontWeight: 500 }}>{display}</span>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: "20px", padding: "12px 16px", background: "rgba(30,42,55,0.04)", borderRadius: "12px", fontSize: "12px", color: "#6c7a89" }}>
            <strong>个税计算说明：</strong>应纳税所得额 = 应发工资 − 个人社保 − 个人公积金 − 起征点，适用七级超额累进税率（3%～45%）。
          </div>
        </div>
      )}
    </div>
  );
}
