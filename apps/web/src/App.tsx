import { lazy } from "react";
import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";
import { LanguageProvider } from "./lib/i18n";
import { PeriodProvider } from "./lib/period-context";
import { AppLayout } from "./components/AppLayout";
import { LEGACY_ENTRY_ALIASES } from "./lib/entry-guidance";

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
      { index: true, element: <Navigate to="/inbox" replace /> },
      { path: "inbox", element: <MyDayPage /> },
      { path: "dashboard/chairman", element: <ChairmanDashboardPage /> },
      { path: "close", element: <MonthEndClosePage /> },
      { path: "events", element: <EventsPage /> },
      { path: "tasks", element: <TasksPage /> },
      // G2 票据中心：单据/发票/银行三合一，旧路由深链重定向
      { path: "bills", element: <BillsCenterPage /> },
      { path: "documents", element: <Navigate to="/bills?tab=documents" replace /> },
      { path: "invoices", element: <Navigate to="/bills?tab=invoices" replace /> },
      { path: "banking", element: <Navigate to="/bills?tab=banking" replace /> },
      { path: "vouchers", element: <VouchersPage /> },
      { path: "ledger", element: <LedgerPage /> },
      { path: "reports", element: <ReportsPage /> },
      // G1 导出与归档中心：合并 PDF 导出 + 财税资料包
      { path: "export-center", element: <ExportCenterPage /> },
      { path: "pdf-export", element: <Navigate to="/export-center" replace /> },
      { path: "archive-package", element: <Navigate to="/export-center" replace /> },
      { path: "tax", element: <TaxPage /> },
      { path: "rnd", element: <RndPage /> },
      { path: "risk", element: <RiskPage /> },
      // W3 合同与往来：合同管理 + 往来单位 合并为 Tab
      { path: "contracts", element: <ContractsDomainPage /> },
      { path: "counterparties", element: <Navigate to="/contracts?tab=counterparties" replace /> },
      // G4 工资域：工资管理 + 代发与社保 合并为 Tab
      { path: "payroll", element: <PayrollDomainPage /> },
      { path: "payroll/transfer", element: <Navigate to="/payroll?tab=transfer" replace /> },
      { path: "assistant", element: <AssistantPage /> },
      { path: "audit", element: <AuditPage /> },
      { path: "knowledge", element: <KnowledgePage /> },
      { path: "boss-qa", element: <Navigate to={LEGACY_ENTRY_ALIASES["boss-qa"]} replace /> },
      // W3 系统中心：系统设置 + 订阅计费 + 反馈与升级 合并为 Tab
      { path: "settings", element: <SystemHubPage /> },
      { path: "billing", element: <Navigate to="/settings?tab=billing" replace /> },
      { path: "feedback", element: <Navigate to="/settings?tab=feedback" replace /> },
    ]
  }
]);

export function App() {
  return (
    <LanguageProvider>
      <PeriodProvider>
        <RouterProvider router={router} />
      </PeriodProvider>
    </LanguageProvider>
  );
}
