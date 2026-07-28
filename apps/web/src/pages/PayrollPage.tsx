/**
 * 工资管理里的三件事：算工资 / 维护员工档案 / 设参数口径。
 *
 * V10 车道 B1：本页不再自持壳层与页内 Tab 条。改造前它同时是「域 Tab 的一页」和
 * 「自己再分三个 Tab 的一页」——加上 PayrollRunWizard 的 6 步，用户要点三层才摸到
 * 具体操作，而前两层讲的是同一件事：工资域里有哪几件事可做。
 *
 * 现在由 PayrollDomainPage 的 TaskFocusShell 统一承担那一层，本组件按 activeTask
 * 只渲染其中一件事的工作区（其余不进 DOM）。PayrollRunWizard 的 6 步保留不动——
 * 那是一件事内部的分步，与「几件事之间的取舍」不是一回事。
 *
 * 期间口径也在这里收口：本页只有一个 activePeriod，全局期间选择器、审计跳转和
 * 工资向导读写的都是它（改造前向导自己另有一个 period，三者互不相干）。
 */
import React, { useEffect, useState } from "react";
import { PayrollRunWizard } from "./payroll/PayrollRunWizard";
import { useLocation, useNavigate } from "react-router-dom";
import type { PayrollPeriodSummary, PayrollRecord, PayrollTaxReviewLedger } from "@finance-taxation/domain-model";
import {
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
import { PayrollTaskContext } from "./payroll/PayrollTaskContext";
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
  const [message, setMessage] = useState("正在加载数据...");

  const employeesState = usePayrollEmployeesState(setMessage);
  const {
    employees, setEmployees, showEmpForm, setShowEmpForm,
    editingEmp, setEditingEmp, empForm, setEmpForm
  } = employeesState;

  const { period: globalPeriod } = usePeriod();
  const [periods, setPeriods] = useState<PayrollPeriodSummary[]>([]);
  /** 本页唯一的期间口径：向导、运行态、事项联动全部读它。 */
  const [activePeriod, setActivePeriod] = useState(navPayrollPeriod ?? globalPeriod);
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
  const [reviewLedgers, setReviewLedgers] = useState<PayrollTaxReviewLedger[]>([]);

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
    void bootstrap();
  }, []);

  // 顶部全局期间切换后本页跟着换；紧随其后的跳转 effect 优先级更高，会再覆盖一次。
  useEffect(() => {
    setActivePeriod(globalPeriod);
  }, [globalPeriod]);

  /**
   * 审计/钻取带来的工资期间：切到这一期，并把这一期的工资记录读出来。
   *
   * 改造前这段逻辑写了两遍（两个 effect 都对 navPayrollPeriod 调 handleLoadPeriod），
   * 于是每次深链进来都打两次接口、两条状态文案互相覆盖。这里合并成一处。
   */
  useEffect(() => {
    if (!navPayrollPeriod) {
      return;
    }
    setActivePeriod(navPayrollPeriod);
    void handleLoadPeriod(navPayrollPeriod).catch(() => {
      setPayrollRecords([]);
      setMessage(`已切换到工资期间 ${navPayrollPeriod}，请先生成或加载工资记录。`);
    });
  }, [navPayrollPeriod]);

  useEffect(() => {
    if (!navEmployeeId) {
      return;
    }
    setMessage(`已按员工 ${navEmployeeId} 定位到员工档案。`);
  }, [navEmployeeId]);

  const linkage = usePayrollEventLinkage({
    selectedPeriod: activePeriod,
    payrollRecords,
    setReviewLedgers,
    setMessage,
    navigate
  });
  const { linkedEventIds, linkedEventId, rememberLinkedEvent } = linkage;

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

  async function handleLoadPeriod(period: string) {
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

  const linkedArtifacts = usePayrollLinkedArtifacts({
    linkedEventId,
    selectedPeriod: activePeriod,
    setReviewLedgers
  });

  const summaries = buildPayrollPageSummaries({
    activePeriod,
    periods,
    payrollRecords,
    linkedEventId,
    linkedRiskCount: linkedArtifacts.linkedRisks.length,
    reviewLedgers,
    roleIds: accessUser?.roleIds ?? []
  });
  const runtimeSummary = useWorkflowRuntimeSummary(
    "payroll",
    { period: summaries.runtimePeriod || undefined },
    summaries.localRuntimeSummary
  );
  const runtimeAttention = needsRuntimeAttention(runtimeSummary);

  useEffect(() => {
    if (!linkedEventId || navState.businessEventId !== linkedEventId) {
      return;
    }
    if (navState.payrollPeriod && navState.payrollPeriod !== activePeriod) {
      return;
    }
    if (navState.tab === "employees" && navState.employeeId) {
      return;
    }
    if (navState.resourceType || navState.resourceId) {
      setMessage(`已恢复工资上下文：事项 ${linkedEventId}，可继续查看税务、凭证或风险结果。`);
    }
  }, [linkedEventId, navState.businessEventId, navState.employeeId, navState.payrollPeriod, navState.resourceId, navState.resourceType, navState.tab, activePeriod]);

  const runtimePanel = (
    <WorkflowRuntimePanel
      title="工资运行态与授权态"
      summary={runtimeSummary}
      onAction={(action) => void linkage.handleRuntimeAction(action)}
      busyActionKey={linkage.runtimeActionKey}
    />
  );

  function renderWorkspace() {
    if (activeTask === PAYROLL_TASK_KEYS.employees) {
      return (
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
      );
    }
    if (activeTask === PAYROLL_TASK_KEYS.policy) {
      return (
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
      );
    }
    return (
      <PayrollRunWizard
        employees={employees}
        periods={periods}
        policy={policy}
        period={activePeriod}
        onPeriodChange={setActivePeriod}
        onRecordsChange={setPayrollRecords}
      />
    );
  }

  return (
    <>
      {renderWorkspace()}
      <PayrollTaskContext message={message} runtime={runtimePanel} runtimeAttention={runtimeAttention} />
    </>
  );
}
