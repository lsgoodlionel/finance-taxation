import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { ChairmanDashboardPage } from "./pages/ChairmanDashboardPage";
import { EventsPage } from "./pages/EventsPage";
import { TasksPage } from "./pages/TasksPage";

const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard/chairman" replace /> },
      { path: "dashboard/chairman", element: <ChairmanDashboardPage /> },
      { path: "events", element: <EventsPage /> },
      { path: "tasks", element: <TasksPage /> }
    ]
  }
]);

export function App() {
  return <RouterProvider router={router} />;
}
