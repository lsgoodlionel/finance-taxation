import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { ChairmanDashboardPage } from "./pages/ChairmanDashboardPage";
import { AssistantPage } from "./pages/AssistantPage";
import { ContractsPage } from "./pages/ContractsPage";
import { PayrollPage } from "./pages/PayrollPage";
import { DocumentsPage } from "./pages/DocumentsPage";
import { EventsPage } from "./pages/EventsPage";
import { LedgerPage } from "./pages/LedgerPage";
import { ReportsPage } from "./pages/ReportsPage";
import { RiskPage } from "./pages/RiskPage";
import { RndPage } from "./pages/RndPage";
import { TaxPage } from "./pages/TaxPage";
import { TasksPage } from "./pages/TasksPage";
import { VouchersPage } from "./pages/VouchersPage";

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard/chairman" replace /> },
      { path: "dashboard/chairman", element: <ChairmanDashboardPage /> },
      { path: "events", element: <EventsPage /> },
      { path: "tasks", element: <TasksPage /> },
      { path: "documents", element: <DocumentsPage /> },
      { path: "vouchers", element: <VouchersPage /> },
      { path: "ledger", element: <LedgerPage /> },
      { path: "reports", element: <ReportsPage /> },
      { path: "tax", element: <TaxPage /> },
      { path: "rnd", element: <RndPage /> },
      { path: "risk", element: <RiskPage /> },
      { path: "contracts", element: <ContractsPage /> },
      { path: "payroll", element: <PayrollPage /> },
      { path: "assistant", element: <AssistantPage /> }
    ]
  }
]);

export function App() {
  return <RouterProvider router={router} />;
}
