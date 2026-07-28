/**
 * /payroll —— 工资这块能办的五件事的工作台。
 *
 * 改造前这里是三层嵌套：域 Tab（工资管理 / 代发与社保）→ PayrollTabBar
 * （员工管理 / 工资计算 / 参数设置）→ 向导的 6 步。前两层讲的是同一个问题
 * ——「这个域里有哪几件事可做」——却让用户点两次；而且 antd Tabs 默认把两个
 * 子页面都挂进 DOM，用户看着「工资管理」时，「代发与社保」的接口也在拉。
 *
 * 现在前两层压成一层 TaskFocusShell：五件事平铺，一次只把其中一件的工作区
 * 挂进 DOM（另一半子页面根本不 mount，也就不会替用户去拉他没在看的数据）。
 * 第三层保留——那是一件事内部的分步，不是几件事之间的取舍。
 */
import React, { useEffect, useMemo, useRef } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { ProPageBanner } from "../../components/ui/ProPageBanner";
import { TaskFocusShell } from "../../components/ui/TaskFocusShell";
import { PayrollPage } from "../PayrollPage";
import { PayrollTransferPage } from "../PayrollTransferPage";
import { PayrollHeader } from "./PayrollHeader";
import { PayrollShell } from "./PayrollShell";
import { normalizePayrollNavState } from "./payroll-page-helpers";
import {
  buildPayrollTasks,
  isPayrollTaskKey,
  isTransferSideTask,
  LEGACY_PAYROLL_TAB_QUERY_KEY,
  PAYROLL_TASK_QUERY_KEY,
  readPayrollTask,
  resolvePayrollTaskFromNav,
  writePayrollTask
} from "./payroll-tasks";

export function PayrollDomainPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navState = normalizePayrollNavState(location.state);

  const activeTask = readPayrollTask(searchParams);
  const tasks = useMemo(() => buildPayrollTasks(), []);

  /**
   * 把「当前这件事」收敛到 URL 上的 ?task=，一处写完两件事：
   *
   * 1. 审计/钻取跳转决定落点。写进 URL 而不是直接算进 activeTask——后者会让
   *    location.state 永久压住切换器，用户点别的任务点不动（/ledger 踩过）。
   *    只认一次：navKey 记下已应用过的跳转信息，否则用户之后手动切任务时，
   *    还挂在 history 里的那份 state 会一次次把他拽回来。
   * 2. 旧的 ?tab= 归一成 ?task=。/payroll/transfer 被 App.tsx 重定向成
   *    ?tab=transfer，收件箱与后端清单里也还留着这个链接。readPayrollTask 已经
   *    认它，这里再把 URL 洗干净，免得两个参数同时挂着、下次读出现「谁说了算」。
   *
   * 两件事必须在同一个 effect 里做：拆成两个的话，同一轮渲染中它们各拿着同一份
   * 旧 searchParams 先后写一次，后写的会把前一个的落点覆盖掉。
   *
   * state 原样带过去，因为子页面还要靠它定位到具体的期间 / 员工 / 批次。
   */
  const navKey = [
    navState.tab,
    navState.employeeId,
    navState.payrollPeriod,
    navState.businessEventId,
    navState.resourceType
  ].join("|");
  const appliedNavKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const isNewNav = appliedNavKeyRef.current !== navKey;
    appliedNavKeyRef.current = navKey;
    const target = (isNewNav ? resolvePayrollTaskFromNav(navState) : null) ?? activeTask;

    const isClean =
      searchParams.get(PAYROLL_TASK_QUERY_KEY) === target &&
      !searchParams.has(LEGACY_PAYROLL_TAB_QUERY_KEY);
    if (isClean) {
      return;
    }
    setSearchParams(writePayrollTask(searchParams, target), { replace: true, state: location.state });
  }, [navKey, searchParams]);

  function selectTask(key: string): void {
    if (!isPayrollTaskKey(key)) {
      return;
    }
    setSearchParams(writePayrollTask(searchParams, key));
  }

  const activeTaskLabel = tasks.find((task) => task.key === activeTask)?.label ?? "";

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <ProPageBanner
        pageName="工资"
        plain="算工资、发工资、代扣个税和社保公积金的操作台，口径要和申报对上，通常由财务或人事执行；您一般只需要确认总额并审批。"
      />
      <PayrollShell
        header={<PayrollHeader activeTaskLabel={activeTaskLabel} />}
        content={(
          <TaskFocusShell
            tasks={tasks}
            activeKey={activeTask}
            onSelectTask={selectTask}
            switcherLabel="工资这块能办的事"
          >
            {isTransferSideTask(activeTask) ? (
              <PayrollTransferPage activeTask={activeTask} />
            ) : (
              <PayrollPage activeTask={activeTask} />
            )}
          </TaskFocusShell>
        )}
      />
    </div>
  );
}
