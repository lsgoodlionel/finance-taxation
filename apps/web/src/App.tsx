import { lazy } from "react";
import { Navigate, RouterProvider, createBrowserRouter, useLocation } from "react-router-dom";
import { LanguageProvider } from "./lib/i18n";
import { PeriodProvider } from "./lib/period-context";
import { WorkspaceModeProvider, useWorkspaceMode } from "./lib/workspace-mode";
import { AppLayout } from "./components/AppLayout";
import { LEGACY_ENTRY_ALIASES } from "./lib/entry-guidance";

/**
 * Stage G 合并后，旧路径重定向到合并页的 Tab。普通 <Navigate> 会丢弃
 * location.state，破坏审计/事项深链的「跳转并高亮」上下文（businessEventId/
 * resourceId 等）。此包装转发 location.state，保住深链下钻上下文。
 */
function RedirectWithState({ to }: { to: string }) {
  const location = useLocation();
  return <Navigate to={to} replace state={location.state} />;
}

/**
 * V7 双轨：首页按工作区模式分流。
 * guided → 老板工作台 /home，pro → 我的一天 /inbox。
 */
function ModeAwareIndexRedirect() {
  const { mode } = useWorkspaceMode();
  return <Navigate to={mode === "guided" ? "/home" : "/inbox"} replace />;
}

// Route-level code splitting: each page loads as its own chunk on demand.
// Pages use named exports, so map them to the default the lazy loader expects.
const ChairmanDashboardPage = lazy(() => import("./pages/ChairmanDashboardPage").then((m) => ({ default: m.ChairmanDashboardPage })));
const AssistantPage = lazy(() => import("./pages/AssistantPage").then((m) => ({ default: m.AssistantPage })));
const ExportCenterPage = lazy(() => import("./pages/export-center/ExportCenterPage").then((m) => ({ default: m.ExportCenterPage })));
const BillsCenterPage = lazy(() => import("./pages/bills/BillsCenterPage").then((m) => ({ default: m.BillsCenterPage })));
const ContractsDomainPage = lazy(() => import("./pages/contracts/ContractsDomainPage").then((m) => ({ default: m.ContractsDomainPage })));
const SystemHubPage = lazy(() => import("./pages/system/SystemHubPage").then((m) => ({ default: m.SystemHubPage })));
const PayrollDomainPage = lazy(() => import("./pages/payroll/PayrollDomainPage").then((m) => ({ default: m.PayrollDomainPage })));
const MonthEndClosePage = lazy(() => import("./pages/MonthEndClosePage").then((m) => ({ default: m.MonthEndClosePage })));
const MyDayPage = lazy(() => import("./pages/MyDayPage").then((m) => ({ default: m.MyDayPage })));
const HomePage = lazy(() => import("./pages/home").then((m) => ({ default: m.HomePage })));
const QuickEntryPage = lazy(() => import("./pages/quick-entry").then((m) => ({ default: m.QuickEntryPage })));
const EventsPage = lazy(() => import("./pages/EventsPage").then((m) => ({ default: m.EventsPage })));
const LedgerPage = lazy(() => import("./pages/LedgerPage").then((m) => ({ default: m.LedgerPage })));
const ReportsPage = lazy(() => import("./pages/ReportsPage").then((m) => ({ default: m.ReportsPage })));
const RiskPage = lazy(() => import("./pages/RiskPage").then((m) => ({ default: m.RiskPage })));
const RndPage = lazy(() => import("./pages/RndPage").then((m) => ({ default: m.RndPage })));
const TaxPage = lazy(() => import("./pages/TaxPage").then((m) => ({ default: m.TaxPage })));
const TasksPage = lazy(() => import("./pages/TasksPage").then((m) => ({ default: m.TasksPage })));
const VouchersPage = lazy(() => import("./pages/VouchersPage").then((m) => ({ default: m.VouchersPage })));
const AuditPage = lazy(() => import("./pages/AuditPage").then((m) => ({ default: m.AuditPage })));
const KnowledgePage = lazy(() => import("./pages/KnowledgePage").then((m) => ({ default: m.KnowledgePage })));

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <ModeAwareIndexRedirect /> },
      // K1/K2 引导模式：老板工作台 + 记一笔向导
      { path: "home", element: <HomePage /> },
      { path: "quick-entry", element: <QuickEntryPage /> },
      { path: "inbox", element: <MyDayPage /> },
      { path: "dashboard/chairman", element: <ChairmanDashboardPage /> },
      { path: "close", element: <MonthEndClosePage /> },
      { path: "events", element: <EventsPage /> },
      { path: "tasks", element: <TasksPage /> },
      // G2 票据中心：单据/发票/银行三合一，旧路由深链重定向
      { path: "bills", element: <BillsCenterPage /> },
      { path: "documents", element: <RedirectWithState to="/bills?tab=documents" /> },
      { path: "invoices", element: <RedirectWithState to="/bills?tab=invoices" /> },
      { path: "banking", element: <RedirectWithState to="/bills?tab=banking" /> },
      { path: "vouchers", element: <VouchersPage /> },
      { path: "ledger", element: <LedgerPage /> },
      { path: "reports", element: <ReportsPage /> },
      // G1 导出与归档中心：合并 PDF 导出 + 财税资料包
      { path: "export-center", element: <ExportCenterPage /> },
      { path: "pdf-export", element: <RedirectWithState to="/export-center" /> },
      { path: "archive-package", element: <RedirectWithState to="/export-center" /> },
      { path: "tax", element: <TaxPage /> },
      { path: "rnd", element: <RndPage /> },
      { path: "risk", element: <RiskPage /> },
      // W3 合同与往来：合同管理 + 往来单位 合并为 Tab
      { path: "contracts", element: <ContractsDomainPage /> },
      { path: "counterparties", element: <RedirectWithState to="/contracts?tab=counterparties" /> },
      // G4 工资域：工资管理 + 代发与社保 合并为 Tab
      { path: "payroll", element: <PayrollDomainPage /> },
      { path: "payroll/transfer", element: <RedirectWithState to="/payroll?tab=transfer" /> },
      { path: "assistant", element: <AssistantPage /> },
      { path: "audit", element: <AuditPage /> },
      { path: "knowledge", element: <KnowledgePage /> },
      { path: "boss-qa", element: <Navigate to={LEGACY_ENTRY_ALIASES["boss-qa"]} replace /> },
      // W3 系统中心：系统设置 + 订阅计费 + 反馈与升级 合并为 Tab
      { path: "settings", element: <SystemHubPage /> },
      { path: "billing", element: <RedirectWithState to="/settings?tab=billing" /> },
      { path: "feedback", element: <RedirectWithState to="/settings?tab=feedback" /> },
    ]
  }
]);

export function App() {
  return (
    <LanguageProvider>
      <PeriodProvider>
        <WorkspaceModeProvider>
          <RouterProvider router={router} />
        </WorkspaceModeProvider>
      </PeriodProvider>
    </LanguageProvider>
  );
}
