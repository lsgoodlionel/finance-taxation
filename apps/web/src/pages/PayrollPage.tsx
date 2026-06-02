import { useEffect, useState } from "react";
import { PayrollRunWizard } from "./payroll/PayrollRunWizard";
import { useLocation, useNavigate } from "react-router-dom";
import type { Employee, PayrollPolicy, PayrollRecord, PayrollPeriodSummary, PayrollTaxReviewLedger, RiskFinding, TaxItem, Voucher } from "@finance-taxation/domain-model";
import {
  analyzeEvent,
  createEvent,
  computePayroll,
  confirmPayroll,
  createEmployee,
  describePageLoadError,
  getIndividualIncomeTaxMaterials,
  getPayrollPeriods,
  getPayrollPolicy,
  listEmployees,
  listEvents,
  listPayroll,
  listPayrollReviewLedgers,
  listRiskFindings,
  listTaxItems,
  listVouchers,
  runEventRiskCheck,
  syncPayrollReviewLedgers,
  updateEmployee,
  updatePayrollPolicy
} from "../lib/api";
import { usePeriod } from "../lib/period-context";
import { buildPayrollEventInput } from "./payroll-event";
import { buildPayrollArtifactSummary, resolvePayrollLinkedEventId } from "./payroll-closure";
import { buildPayrollRiskBuckets, buildPayrollVoucherSuggestions } from "./payroll-guidance";
import { buildPayrollLinkageSummary } from "./payroll-linkage";
import { buildPayrollTaxReviewSummary } from "./payroll-tax-review";
import { buildPayrollWorkflow } from "./payroll-workflow";
import { PayrollEmployeesSection } from "./payroll/PayrollEmployeesSection";
import { PayrollHeader } from "./payroll/PayrollHeader";
import { PayrollEmployeeForm } from "./payroll/PayrollEmployeeForm";
import { PayrollEmployeesTable } from "./payroll/PayrollEmployeesTable";
import { PayrollPolicyForm } from "./payroll/PayrollPolicyForm";
import { PayrollPolicySection } from "./payroll/PayrollPolicySection";
import { PayrollRecordsTable } from "./payroll/PayrollRecordsTable";
import { PayrollRunSection } from "./payroll/PayrollRunSection";
import { PayrollShell } from "./payroll/PayrollShell";
import { PayrollTabBar, type PayrollTab } from "./payroll/PayrollTabBar";
import { PayrollWorkflowSummary } from "./payroll/PayrollWorkflowSummary";

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

function normalizePayrollNavState(state: unknown) {
  if (!state || typeof state !== "object") {
    return {};
  }
  const source = state as Record<string, unknown>;
  const pick = (key: string) => typeof source[key] === "string" ? source[key] : undefined;
  return {
    businessEventId: pick("businessEventId"),
    employeeId: pick("employeeId"),
    payrollPeriod: pick("payrollPeriod"),
    tab: pick("tab"),
    resourceType: pick("resourceType"),
    resourceId: pick("resourceId")
  };
}

function buildPayrollNavigationState(
  period: string,
  businessEventId: string,
  extra?: Record<string, string>
) {
  return {
    payrollPeriod: period,
    businessEventId,
    ...extra
  };
}

export function PayrollPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const navState = normalizePayrollNavState(location.state);
  const navPayrollPeriod = navState.payrollPeriod ?? null;
  const navEmployeeId = navState.employeeId ?? null;
  const navTab = navState.tab ?? null;
  const navBusinessEventId = navState.businessEventId ?? null;
  const [tab, setTab] = useState<PayrollTab>(navPayrollPeriod || navBusinessEventId ? "payroll" : "employees");
  const [message, setMessage] = useState("正在加载数据...");

  // employees tab
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [showEmpForm, setShowEmpForm] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [empForm, setEmpForm] = useState({ ...EMPTY_EMP_FORM });

  // payroll tab
  const { period: globalPeriod } = usePeriod();
  const [periods, setPeriods] = useState<PayrollPeriodSummary[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [customPeriod, setCustomPeriod] = useState(globalPeriod);

  // 全局期间变化时同步「计算工资」默认期间
  useEffect(() => { setCustomPeriod(globalPeriod); }, [globalPeriod]);
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
  const [computing, setComputing] = useState(false);
  const [linkedEventIds, setLinkedEventIds] = useState<Record<string, string>>({});
  const [creatingEventPeriod, setCreatingEventPeriod] = useState<string | null>(null);
  const [linkedTaxItemCount, setLinkedTaxItemCount] = useState(0);
  const [linkedVoucherCount, setLinkedVoucherCount] = useState(0);
  const [linkedTaxItems, setLinkedTaxItems] = useState<TaxItem[]>([]);
  const [linkedVouchers, setLinkedVouchers] = useState<Voucher[]>([]);
  const [linkedRisks, setLinkedRisks] = useState<RiskFinding[]>([]);
  const [reviewLedgers, setReviewLedgers] = useState<PayrollTaxReviewLedger[]>([]);
  const [iitChecklist, setIitChecklist] = useState<string[]>([]);
  const [iitMaterialPeriod, setIitMaterialPeriod] = useState<string | null>(null);

  // policy tab
  const [policy, setPolicy] = useState<PayrollPolicy | null>(null);
  const [policyForm, setPolicyForm] = useState<Record<string, string>>({});
  const [editingPolicy, setEditingPolicy] = useState(false);

  useEffect(() => {
    async function bootstrap() {
      try {
        await loadAll();
      } catch (error) {
        setMessage(describePageLoadError(error));
      }
    }
    bootstrap();
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("payroll_linked_event_ids");
      if (raw) {
        setLinkedEventIds(JSON.parse(raw) as Record<string, string>);
      }
    } catch {
      // ignore broken session payloads
    }
  }, []);

  useEffect(() => {
    if (navTab === "employees" || navEmployeeId) {
      setTab("employees");
      if (navEmployeeId) {
        setMessage(`已按员工 ${navEmployeeId} 恢复工资管理上下文。`);
      }
      return;
    }
    if (navPayrollPeriod || navBusinessEventId) {
      setTab("payroll");
    }
  }, [navBusinessEventId, navEmployeeId, navPayrollPeriod, navTab]);

  useEffect(() => {
    if (!navPayrollPeriod) {
      return;
    }
    setCustomPeriod(navPayrollPeriod);
    void handleLoadPeriod(navPayrollPeriod).catch(() => {
      setSelectedPeriod(navPayrollPeriod);
      setPayrollRecords([]);
      setMessage(`已切换到工资期间 ${navPayrollPeriod}，请先生成或加载工资记录。`);
    });
  }, [navPayrollPeriod]);

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
    try {
      const eventsRes = await listEvents();
      const restoredEventId = resolvePayrollLinkedEventId(period, linkedEventIds, eventsRes.items);
      if (restoredEventId) {
        rememberLinkedEvent(period, restoredEventId);
      }
    } catch {
      // keep manual linkage only
    }
    setMessage(`已加载 ${period} 工资数据，共 ${res.total} 条。`);
  }

  useEffect(() => {
    if (!navState.payrollPeriod) {
      return;
    }
    void handleLoadPeriod(navState.payrollPeriod).catch((error) => setMessage((error as Error).message));
  }, [navState.payrollPeriod]);

  async function handleConfirm(recordId: string) {
    await confirmPayroll(recordId);
    if (selectedPeriod) {
      const res = await listPayroll(selectedPeriod);
      setPayrollRecords(res.items);
    }
    setMessage("工资记录已确认。");
  }

  function rememberLinkedEvent(period: string, eventId: string) {
    setLinkedEventIds((current) => {
      const next = { ...current, [period]: eventId };
      sessionStorage.setItem("payroll_linked_event_ids", JSON.stringify(next));
      return next;
    });
  }

  async function handleCreatePayrollEvent() {
    if (!selectedPeriod || payrollRecords.length === 0) {
      setMessage("请先选择并生成工资期间数据。");
      return;
    }

    setCreatingEventPeriod(selectedPeriod);
    try {
      const input = buildPayrollEventInput(selectedPeriod, payrollRecords);
      const existingEvents = await listEvents();
      const existing = existingEvents.items.find(
        (event) => event.type === "payroll" && event.title === input.title
      );
      const event = existing ?? await createEvent(input);
      await analyzeEvent(event.id);
      const ledgers = await syncPayrollReviewLedgers({
        period: selectedPeriod,
        businessEventId: event.id
      });
      setReviewLedgers(ledgers.items);
      rememberLinkedEvent(selectedPeriod, event.id);
      setMessage(`已将 ${selectedPeriod} 工资期接入事项主线，并同步 ${ledgers.total} 本税务复核台账。`);
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setCreatingEventPeriod(null);
    }
  }

  function navigateWithEvent(path: string, extraState?: Record<string, string>) {
    const eventId = linkedEventIds[selectedPeriod];
    if (!eventId) {
      setMessage("请先生成工资事项，再进入任务、税务或凭证中心。");
      return;
    }
    navigate(path, { state: buildPayrollNavigationState(selectedPeriod, eventId, extraState) });
  }

  const linkedEventId = selectedPeriod ? linkedEventIds[selectedPeriod] ?? null : null;
  const payrollWorkflow = selectedPeriod
    ? buildPayrollWorkflow({
        period: selectedPeriod,
        records: payrollRecords,
        linkedEventId
      })
    : null;
  const payrollLinkage = selectedPeriod
    ? buildPayrollLinkageSummary({
        taxItemCount: linkedTaxItemCount,
        voucherCount: linkedVoucherCount,
        confirmedCount: payrollRecords.filter((record) => record.status === "confirmed").length,
        totalCount: payrollRecords.length,
        linkedEventId
      })
    : null;
  const payrollTaxReview = selectedPeriod
    ? buildPayrollTaxReviewSummary({
        period: selectedPeriod,
        records: payrollRecords,
        linkedEventId,
        taxItemCount: linkedTaxItemCount,
        iitMaterial: iitMaterialPeriod === selectedPeriod
          ? {
              companyId: "",
              filingPeriod: iitMaterialPeriod,
              payrollEventCount: linkedEventId ? 1 : 0,
              withholdingItemCount: linkedTaxItemCount,
              totalPayrollAmount: "0",
              checklist: iitChecklist
            }
          : null
      })
    : null;
  const payrollArtifactSummary = buildPayrollArtifactSummary({
    taxItems: linkedTaxItems,
    vouchers: linkedVouchers,
    risks: linkedRisks
  });
  const payrollVoucherSuggestions = buildPayrollVoucherSuggestions(payrollRecords, linkedVouchers);
  const payrollRiskBuckets = buildPayrollRiskBuckets(linkedRisks);

  useEffect(() => {
    let active = true;

    async function loadLinkedArtifacts() {
      try {
        const [taxRes, voucherRes, riskRes, iitRes, ledgerRes] = await Promise.all([
          linkedEventId ? listTaxItems({ businessEventId: linkedEventId }) : Promise.resolve({ items: [], total: 0 }),
          linkedEventId ? listVouchers({ businessEventId: linkedEventId }) : Promise.resolve({ items: [], total: 0 }),
          linkedEventId ? listRiskFindings() : Promise.resolve({ items: [], total: 0 }),
          getIndividualIncomeTaxMaterials(selectedPeriod),
          linkedEventId
            ? syncPayrollReviewLedgers({
                period: selectedPeriod,
                businessEventId: linkedEventId
              }).catch(() => ({ items: [], total: 0 }))
            : listPayrollReviewLedgers(selectedPeriod).catch(() => ({ items: [], total: 0 }))
        ]);
        if (!active) return;
        setLinkedTaxItemCount(taxRes.total);
        setLinkedVoucherCount(voucherRes.total);
        setLinkedTaxItems(taxRes.items);
        setLinkedVouchers(voucherRes.items);
        setLinkedRisks(
          riskRes.items
            .filter((item) => item.businessEventId === linkedEventId)
        );
        setIitChecklist(iitRes.checklist);
        setIitMaterialPeriod(iitRes.filingPeriod);
        setReviewLedgers(ledgerRes.items);
      } catch {
        if (!active) return;
        setLinkedTaxItemCount(0);
        setLinkedVoucherCount(0);
        setLinkedTaxItems([]);
        setLinkedVouchers([]);
        setLinkedRisks([]);
        setReviewLedgers([]);
        setIitChecklist([]);
        setIitMaterialPeriod(null);
      }
    }

    void loadLinkedArtifacts();
    return () => {
      active = false;
    };
  }, [linkedEventId, selectedPeriod]);

  useEffect(() => {
    if (!linkedEventId || navState.businessEventId !== linkedEventId) {
      return;
    }
    if (navState.payrollPeriod && navState.payrollPeriod !== selectedPeriod) {
      return;
    }
    if (navState.tab === "employees" && navState.employeeId) {
      return;
    }
    if (navState.resourceType || navState.resourceId) {
      setMessage(`已恢复工资上下文：事项 ${linkedEventId}，可继续查看税务、凭证或风险结果。`);
    }
  }, [linkedEventId, navState.businessEventId, navState.employeeId, navState.payrollPeriod, navState.resourceId, navState.resourceType, navState.tab, selectedPeriod]);

  async function handlePayrollRiskCheck() {
    const eventId = linkedEventIds[selectedPeriod];
    if (!eventId) {
      setMessage("请先生成工资事项，再执行风险检查。");
      return;
    }
    try {
      const result = await runEventRiskCheck(eventId);
      setMessage(`工资事项风险检查完成，生成 ${result.total} 条发现。`);
      navigate("/risk", {
        state: buildPayrollNavigationState(selectedPeriod, eventId, {
          focus: "payroll-risk",
          riskScope: "payroll"
        })
      });
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function handleSyncReviewLedgers() {
    if (!selectedPeriod) {
      setMessage("请先选择工资期间。");
      return;
    }
    try {
      const res = await syncPayrollReviewLedgers({
        period: selectedPeriod,
        businessEventId: linkedEventId
      });
      setReviewLedgers(res.items);
      setMessage(`已同步 ${res.total} 本工资税务复核台账。`);
    } catch (error) {
      setMessage((error as Error).message);
    }
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

  const header = (
    <PayrollHeader
      message={message}
      actions={<PayrollTabBar activeTab={tab} onChange={setTab} />}
    />
  );

  const content = (
    <>

      {/* ── Tab: 员工管理 ── */}
      {tab === "employees" && (
        <PayrollEmployeesSection
          toolbar={(
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button style={btnPrimary()} onClick={() => { setShowEmpForm(!showEmpForm); setEditingEmp(null); setEmpForm({ ...EMPTY_EMP_FORM }); }}>
                + 添加员工
              </button>
            </div>
          )}
          form={(showEmpForm || editingEmp) ? (
            <PayrollEmployeeForm
              editingName={editingEmp?.name}
              form={empForm}
              onChange={setEmpForm}
              onSubmit={editingEmp ? handleUpdateEmployee : handleCreateEmployee}
              onCancel={() => { setShowEmpForm(false); setEditingEmp(null); }}
              primaryLabel={editingEmp ? "保存修改" : "确认添加"}
            />
          ) : undefined}
          list={(
            <PayrollEmployeesTable
              employees={employees}
              navEmployeeId={navEmployeeId}
              employeeStatusLabels={EMPLOYEE_STATUS_LABELS}
              formatAmount={fmt}
              onEdit={startEditEmployee}
              cellStyle={cellStyle}
            />
          )}
        />
      )}

      {/* ── Tab: 工资计算 ── */}
      {tab === "payroll" && (
        <PayrollRunWizard employees={employees} periods={periods} policy={policy} />
      )}
      {/* ── Tab: 参数设置 ── */}
      {tab === "policy" && policy && (
        <PayrollPolicySection
          content={(
            <PayrollPolicyForm
              editing={editingPolicy}
              form={policyForm}
              onChange={setPolicyForm}
              onStartEdit={() => setEditingPolicy(true)}
              onSave={handleSavePolicy}
              onCancel={() => { setEditingPolicy(false); setPolicyForm(policyToForm(policy)); }}
              formatAmount={fmt}
              formatPercent={pct}
            />
          )}
        />
      )}
    </>
  );

  return (
    <PayrollShell
      header={header}
      content={content}
    />
  );
}
