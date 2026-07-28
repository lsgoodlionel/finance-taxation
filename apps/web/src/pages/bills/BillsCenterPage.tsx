/**
 * 票据中心页面（路由 /bills）
 *
 * V10：容器负责壳层，子页只提供内容主体。
 * - 横幅 / 标题 / 业务链路条 / 任务切换器都由这里出一份，消除「两个标题两条链路条」
 * - 三件事（单据 / 发票 / 银行）由 TaskFocusShell 承载，一次只有一件事进 DOM
 * - 当前这件事仍写在 ?tab= 上，键名与取值不变，既有深链与重定向照常工作
 */
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { ProPageBanner } from "../../components/ui/ProPageBanner";
import { FinanceFlowBar } from "../../components/FinanceFlowBar";
import { TaskFocusShell } from "../../components/ui/TaskFocusShell";
import { resolveActiveTask } from "../../lib/task-focus";
import { DocumentsPage } from "../DocumentsPage";
import { InvoicesPage } from "../invoices/InvoicesPage";
import { BankingPage } from "../banking/BankingPage";
import {
  BILLS_TAB_KEYS,
  BILLS_TAB_QUERY_KEY,
  DEFAULT_BILLS_TAB,
  buildBillsTasks,
  getBillsTabTitle
} from "./bills-tasks";

export function BillsCenterPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tasks = useMemo(() => buildBillsTasks(), []);
  const activeTab =
    resolveActiveTask(tasks, searchParams.get(BILLS_TAB_QUERY_KEY), DEFAULT_BILLS_TAB) ?? DEFAULT_BILLS_TAB;

  const handleSelectTask = useCallback(
    (nextTab: string) => {
      setSearchParams(
        (previousParams) => {
          const nextParams = new URLSearchParams(previousParams);
          nextParams.set(BILLS_TAB_QUERY_KEY, nextTab);
          return nextParams;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  // 只有当前这件事会被挂载：另外两页既不进 DOM，也不会白跑一遍它们的数据加载
  // （原来用 antd Tabs，访问过的页签会一直挂在 DOM 里）。
  const taskPanels: Record<string, JSX.Element> = {
    [BILLS_TAB_KEYS.documents]: <DocumentsPage />,
    [BILLS_TAB_KEYS.invoices]: <InvoicesPage />,
    [BILLS_TAB_KEYS.banking]: <BankingPage />
  };

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <ProPageBanner
        pageName="票据中心"
        plain="收进来的发票、单据和银行流水都堆在这里，等财务逐张核对、登记入账。"
      />
      <PageHeader
        title={getBillsTabTitle(activeTab)}
        subtitle="票据中心：单据、发票、银行流水收纳于一处，一次处理一类。"
      />
      <FinanceFlowBar current="documents" />
      <TaskFocusShell
        tasks={tasks}
        activeKey={activeTab}
        onSelectTask={handleSelectTask}
        switcherLabel="票据中心当前要做的事"
      >
        {taskPanels[activeTab] ?? null}
      </TaskFocusShell>
    </div>
  );
}
