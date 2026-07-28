/**
 * 工资管理里的三件事：算工资 / 维护员工档案 / 设参数口径。
 *
 * V10 车道 B1：本页不再自持壳层与页内 Tab 条。改造前它同时是「域 Tab 的一页」和
 * 「自己再分三个 Tab 的一页」——加上 PayrollRunWizard 的 6 步，用户要点三层才摸到
 * 具体操作，而前两层讲的是同一件事：工资域里有哪几件事可做。
 *
 * 现在由 PayrollDomainPage 的 TaskFocusShell 统一承担那一层，本组件按 activeTask
 * 只渲染其中一件事的工作区。PayrollRunWizard 的 6 步保留不动——那是一件事内部的
 * 分步，与「几件事之间的取舍」不是一回事。
 */
import React, { useEffect, useState } from "react";
import { PayrollRunWizard } from "./payroll/PayrollRunWizard";
import { useLocation, useNavigate } from "react-router-dom";
import type { PayrollPeriodSummary, PayrollRecord, PayrollTaxReviewLedger } from "@finance-taxation/domain-model";
import {
  computePayroll,
  confirmPayroll,
  describePageLoadError,
  getPayrollPeriods,
  getPayrollPolicy,
  listEmployees,
  listEvents,
  listPayroll
} from "../lib/api";
import { usePeriod } from "../lib/period-context";
import { resolvePayrollLinkedEventId } from "./payroll-closure";
import { PayrollEmployeesTabPanel } from "./payroll/PayrollEmployeesTabPanel";
import { PayrollPolicyTabPanel } from "./payroll/PayrollPolicyTabPanel";
import {
  EMPTY_EMP_FORM,
  isPayrollPolicyMissingError,
  normalizePayrollNavState,
  policyToForm
} from "./payroll/payroll-page-helpers";
import { buildPayrollPageSummaries } from "./payroll/payroll-page-summaries";
import { PAYROLL_TASK_KEYS, type PayrollTaskKey } from "./payroll/payroll-tasks";
import { usePayrollEmployeesState } from "./payroll/usePayrollEmployeesState";
import { usePayrollEventLinkage } from "./payroll/usePayrollEventLinkage";
import { usePayrollLinkedArtifacts } from "./payroll/usePayrollLinkedArtifacts";
import { usePayrollPolicyState } from "./payroll/usePayrollPolicyState";
import { useAccessUser } from "../features/runtime/useAccessUser";
import { WorkflowRuntimePanel } from "../features/runtime/WorkflowRuntimePanel";
import { useWorkflowRuntimeSummary } from "../features/runtime/useWorkflowRuntimeSummary";
import { needsRuntimeAttention } from "../features/runtime/runtime-attention";

const STATUS_LINE_STYLE: React.CSSProperties = { fontSize: "13px" };

const DETAILS_SUMMARY_STYLE: React.CSSProperties = {
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  color: "#4d5d6c"
};

export interface PayrollPageProps {
  /** 由 PayrollDomainPage 的任务切换器决定；缺省时按「算工资」渲染。 */
  activeTask?: PayrollTaskKey;
}

export function PayrollPage({ activeTask = PAYROLL_TASK_KEYS.run }: PayrollPageProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const navState = normalizePayrollNavState(location.state);
  const navPayrollPeriod = navState.payrollPeriod ?? null;
  const navEmployeeId = navState.employeeId ?? null;
  const navBusinessEventId = navState.businessEventId ?? null;
  const [message, setMessage] = useState("正在加载数据...");

  // employees tab
  const employeesState = usePayrollEmployeesState(setMessage);
  const {
    employees, setEmployees, showEmpForm, setShowEmpForm,
    editingEmp, setEditingEmp, empForm, setEmpForm
  } = employeesState;

  // payroll tab
  const { period: globalPeriod } = usePeriod();
  const [periods, setPeriods] = useState<PayrollPeriodSummary[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [customPeriod, setCustomPeriod] = useState(globalPeriod);

  // 全局期间变化时同步「计算工资」默认期间
  useEffect(() => { setCustomPeriod(globalPeriod); }, [globalPeriod]);
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
  const [computing, setComputing] = useState(false);
  const [reviewLedgers, setReviewLedgers] = useState<PayrollTaxReviewLedger[]>([]);

  // policy tab
  const policyState = usePayrollPolicyState(setMessage);
  const { policy, setPolicy, setPolicyForm, setEditingPolicy, setPolicyMissing } = policyState;
  const accessUser = useAccessUser();

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

  const linkage = usePayrollEventLinkage({
    selectedPeriod,
    payrollRecords,
    setReviewLedgers,
    setMessage,
    navigate
  });
  const { linkedEventIds, linkedEventId, rememberLinkedEvent } = linkage;

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
    const [empRes, perRes, policyResult] = await Promise.all([
      listEmployees(),
      getPayrollPeriods(),
      getPayrollPolicy()
        .then((result) => ({ ok: true as const, result }))
        .catch((error) => ({ ok: false as const, error }))
    ]);
    setEmployees(empRes.items);
    setPeriods(perRes.items);
    if (policyResult.ok) {
      setPolicy(policyResult.result.policy);
      setPolicyForm(policyToForm(policyResult.result.policy));
      setPolicyMissing(false);
      setMessage(`已加载 ${empRes.total} 名员工，${perRes.total} 个工资期。`);
      return;
    }
    if (isPayrollPolicyMissingError(policyResult.error)) {
      setPolicy(null);
      setPolicyForm({});
      setPolicyMissing(true);
      setMessage("工资参数尚未配置。当前可先维护员工和期间，参数设置页会提示后续配置要求。");
      return;
    }
    throw policyResult.error;
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

  const linkedArtifacts = usePayrollLinkedArtifacts({
    linkedEventId,
    selectedPeriod,
    setReviewLedgers
  });

  const summaries = buildPayrollPageSummaries({
    selectedPeriod,
    customPeriod,
    periods,
    payrollRecords,
    linkedEventId,
    linkedTaxItemCount: linkedArtifacts.linkedTaxItemCount,
    linkedVoucherCount: linkedArtifacts.linkedVoucherCount,
    linkedTaxItems: linkedArtifacts.linkedTaxItems,
    linkedVouchers: linkedArtifacts.linkedVouchers,
    linkedRisks: linkedArtifacts.linkedRisks,
    reviewLedgers,
    iitChecklist: linkedArtifacts.iitChecklist,
    iitMaterialPeriod: linkedArtifacts.iitMaterialPeriod,
    roleIds: accessUser?.roleIds ?? []
  });
  const runtimeSummary = useWorkflowRuntimeSummary(
    "payroll",
    { period: summaries.runtimePeriod || undefined },
    summaries.localRuntimeSummary
  );

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

  const header = (
    <PayrollHeader
      message={message}
      actions={<PayrollTabBar activeTab={tab} onChange={setTab} />}
    />
  );

  const content = (
    <>
      <WorkflowRuntimePanel
        title="工资运行态与授权态"
        summary={runtimeSummary}
        onAction={(action) => void linkage.handleRuntimeAction(action)}
        busyActionKey={linkage.runtimeActionKey}
      />

      {/* ── Tab: 员工管理 ── */}
      {tab === "employees" && (
        <PayrollEmployeesTabPanel
          employees={employees}
          navEmployeeId={navEmployeeId}
          showEmpForm={showEmpForm}
          editingEmp={editingEmp}
          empForm={empForm}
          onEmpFormChange={setEmpForm}
          onToggleForm={() => { setShowEmpForm(!showEmpForm); setEditingEmp(null); setEmpForm({ ...EMPTY_EMP_FORM }); }}
          onCancelForm={() => { setShowEmpForm(false); setEditingEmp(null); }}
          onCreateEmployee={employeesState.handleCreateEmployee}
          onUpdateEmployee={employeesState.handleUpdateEmployee}
          onEditEmployee={employeesState.startEditEmployee}
        />
      )}

      {/* ── Tab: 工资计算 ── */}
      {tab === "payroll" && (
        <PayrollRunWizard employees={employees} periods={periods} policy={policy} />
      )}
      {/* ── Tab: 参数设置 ── */}
      {tab === "policy" && (
        <PayrollPolicyTabPanel
          policy={policy}
          policyForm={policyState.policyForm}
          editingPolicy={policyState.editingPolicy}
          policyMissing={policyState.policyMissing}
          onPolicyFormChange={setPolicyForm}
          onStartEdit={() => setEditingPolicy(true)}
          onSave={policyState.handleSavePolicy}
          onCancelEdit={() => {
            setEditingPolicy(false);
            if (policy) {
              setPolicyForm(policyToForm(policy));
            }
          }}
        />
      )}
    </>
  );

  return <PayrollShell header={header} content={content} />;
}
