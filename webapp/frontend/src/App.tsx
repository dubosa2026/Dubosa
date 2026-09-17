import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { RadarIA } from "./pages/RadarIA";
import { MeuDia } from "./pages/MeuDia";
import { Equipe } from "./pages/Equipe";
import { VendedorDetalhe } from "./pages/VendedorDetalhe";
import { Clientes } from "./pages/Clientes";
import { ClienteDetalhe } from "./pages/ClienteDetalhe";
import { Reativacao } from "./pages/Reativacao";
import { Metas } from "./pages/Metas";
import { Tarefas } from "./pages/Tarefas";
import { CentralIA } from "./pages/CentralIA";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Carregando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="meu-dia" element={<MeuDia />} />
        <Route path="radar" element={<RadarIA />} />
        <Route path="equipe" element={<Equipe />} />
        <Route path="equipe/:id" element={<VendedorDetalhe />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="clientes/:id" element={<ClienteDetalhe />} />
        <Route path="reativacao" element={<Reativacao />} />
        <Route path="metas" element={<Metas />} />
        <Route path="tarefas" element={<Tarefas />} />
        <Route path="central-ia" element={<CentralIA />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
