import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";
import { LanguageProvider } from "./lib/i18n";
import { PeriodProvider } from "./lib/period-context";
import { AppLayout } from "./components/AppLayout";
import { ChairmanDashboardPage } from "./pages/ChairmanDashboardPage";
import { AssistantPage } from "./pages/AssistantPage";
import { PdfExportPage } from "./pages/PdfExportPage";
import { ContractsPage } from "./pages/ContractsPage";
import { PayrollPage } from "./pages/PayrollPage";
import { PayrollTransferPage } from "./pages/PayrollTransferPage";
import { MonthEndClosePage } from "./pages/MonthEndClosePage";
import { MyDayPage } from "./pages/MyDayPage";
import { CounterpartiesPage } from "./pages/CounterpartiesPage";
import { BillingPage } from "./pages/BillingPage";
import { ArchivePackagePage } from "./pages/ArchivePackagePage";
import { FeedbackPage } from "./pages/FeedbackPage";
import { DocumentsPage } from "./pages/DocumentsPage";
import { EventsPage } from "./pages/EventsPage";
import { LedgerPage } from "./pages/LedgerPage";
import { ReportsPage } from "./pages/ReportsPage";
import { RiskPage } from "./pages/RiskPage";
import { RndPage } from "./pages/RndPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TaxPage } from "./pages/TaxPage";
import { TasksPage } from "./pages/TasksPage";
import { VouchersPage } from "./pages/VouchersPage";
import { AuditPage } from "./pages/AuditPage";
import { KnowledgePage } from "./pages/KnowledgePage";
import { BankingPage } from "./pages/banking/BankingPage";
import { InvoicesPage } from "./pages/invoices/InvoicesPage";
import { LEGACY_ENTRY_ALIASES } from "./lib/entry-guidance";

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
