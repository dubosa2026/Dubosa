import { useCallback, useState } from "react";
import type { DashboardData } from "../shared/ipc";
import Login from "./screens/Login";
import Dashboard from "./screens/Dashboard";

export default function App() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);

  const handleLogout = useCallback(async () => {
    await window.focoGer.logout();
    setDashboard(null);
  }, []);

  if (!dashboard) {
    return <Login onLoggedIn={setDashboard} />;
  }

  return <Dashboard initialData={dashboard} onLogout={handleLogout} />;
}
