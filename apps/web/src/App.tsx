import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { ChairmanDashboardPage } from "./pages/ChairmanDashboardPage";
import { DocumentsPage } from "./pages/DocumentsPage";
import { EventsPage } from "./pages/EventsPage";
import { LedgerPage } from "./pages/LedgerPage";
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
      { path: "tax", element: <TaxPage /> }
    ]
  }
]);

export function App() {
  return <RouterProvider router={router} />;
}
