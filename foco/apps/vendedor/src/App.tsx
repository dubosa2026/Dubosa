import { useCallback, useState } from "react";
import type { HomeData } from "../shared/ipc";
import Login from "./screens/Login";
import Home from "./screens/Home";

export default function App() {
  const [homeData, setHomeData] = useState<HomeData | null>(null);

  const handleLogout = useCallback(async () => {
    await window.foco.logout();
    setHomeData(null);
  }, []);

  if (!homeData) {
    return <Login onLoggedIn={setHomeData} />;
  }

  return <Home initialData={homeData} onLogout={handleLogout} />;
}
