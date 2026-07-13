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
const PdfExportPage = lazy(() => import("./pages/PdfExportPage").then((m) => ({ default: m.PdfExportPage })));
const ContractsPage = lazy(() => import("./pages/ContractsPage").then((m) => ({ default: m.ContractsPage })));
const PayrollPage = lazy(() => import("./pages/PayrollPage").then((m) => ({ default: m.PayrollPage })));
const PayrollTransferPage = lazy(() => import("./pages/PayrollTransferPage").then((m) => ({ default: m.PayrollTransferPage })));
const MonthEndClosePage = lazy(() => import("./pages/MonthEndClosePage").then((m) => ({ default: m.MonthEndClosePage })));
const MyDayPage = lazy(() => import("./pages/MyDayPage").then((m) => ({ default: m.MyDayPage })));
const CounterpartiesPage = lazy(() => import("./pages/CounterpartiesPage").then((m) => ({ default: m.CounterpartiesPage })));
const BillingPage = lazy(() => import("./pages/BillingPage").then((m) => ({ default: m.BillingPage })));
const ArchivePackagePage = lazy(() => import("./pages/ArchivePackagePage").then((m) => ({ default: m.ArchivePackagePage })));
const FeedbackPage = lazy(() => import("./pages/FeedbackPage").then((m) => ({ default: m.FeedbackPage })));
const DocumentsPage = lazy(() => import("./pages/DocumentsPage").then((m) => ({ default: m.DocumentsPage })));
const EventsPage = lazy(() => import("./pages/EventsPage").then((m) => ({ default: m.EventsPage })));
const LedgerPage = lazy(() => import("./pages/LedgerPage").then((m) => ({ default: m.LedgerPage })));
const ReportsPage = lazy(() => import("./pages/ReportsPage").then((m) => ({ default: m.ReportsPage })));
const RiskPage = lazy(() => import("./pages/RiskPage").then((m) => ({ default: m.RiskPage })));
const RndPage = lazy(() => import("./pages/RndPage").then((m) => ({ default: m.RndPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const TaxPage = lazy(() => import("./pages/TaxPage").then((m) => ({ default: m.TaxPage })));
const TasksPage = lazy(() => import("./pages/TasksPage").then((m) => ({ default: m.TasksPage })));
const VouchersPage = lazy(() => import("./pages/VouchersPage").then((m) => ({ default: m.VouchersPage })));
const AuditPage = lazy(() => import("./pages/AuditPage").then((m) => ({ default: m.AuditPage })));
const KnowledgePage = lazy(() => import("./pages/KnowledgePage").then((m) => ({ default: m.KnowledgePage })));
const BankingPage = lazy(() => import("./pages/banking/BankingPage").then((m) => ({ default: m.BankingPage })));
const InvoicesPage = lazy(() => import("./pages/invoices/InvoicesPage").then((m) => ({ default: m.InvoicesPage })));

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/assistant" replace /> },
      { path: "inbox", element: <MyDayPage /> },
      { path: "dashboard/chairman", element: <ChairmanDashboardPage /> },
      { path: "close", element: <MonthEndClosePage /> },
      { path: "events", element: <EventsPage /> },
      { path: "tasks", element: <TasksPage /> },
      { path: "documents", element: <DocumentsPage /> },
      { path: "vouchers", element: <VouchersPage /> },
      { path: "ledger", element: <LedgerPage /> },
      { path: "reports", element: <ReportsPage /> },
      { path: "archive-package", element: <ArchivePackagePage /> },
      { path: "tax", element: <TaxPage /> },
      { path: "rnd", element: <RndPage /> },
      { path: "risk", element: <RiskPage /> },
      { path: "contracts", element: <ContractsPage /> },
      { path: "counterparties", element: <CounterpartiesPage /> },
      { path: "payroll", element: <PayrollPage /> },
      { path: "payroll/transfer", element: <PayrollTransferPage /> },
      { path: "assistant", element: <AssistantPage /> },
      { path: "pdf-export", element: <PdfExportPage /> },
      { path: "audit", element: <AuditPage /> },
      { path: "knowledge", element: <KnowledgePage /> },
      { path: "boss-qa", element: <Navigate to={LEGACY_ENTRY_ALIASES["boss-qa"]} replace /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "billing", element: <BillingPage /> },
      { path: "feedback", element: <FeedbackPage /> },
      { path: "banking", element: <BankingPage /> },
      { path: "invoices", element: <InvoicesPage /> },
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
