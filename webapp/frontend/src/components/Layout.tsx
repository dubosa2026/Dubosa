import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const NAV_ITEMS = [
  { to: "/meu-dia", label: "Meu Dia", icon: "☀️" },
  { to: "/", label: "Dashboard", icon: "📊", end: true },
  { to: "/radar", label: "Radar IA", icon: "📡" },
  { to: "/equipe", label: "Equipe", icon: "👥" },
  { to: "/clientes", label: "Clientes", icon: "🏢" },
  { to: "/reativacao", label: "Reativação", icon: "🔄" },
  { to: "/metas", label: "Metas", icon: "🎯" },
  { to: "/tarefas", label: "Tarefas", icon: "✅" },
  { to: "/central-ia", label: "Pergunte à IA", icon: "💬" },
];

const MOBILE_ITEMS = [
  { to: "/meu-dia", label: "Meu Dia", icon: "☀️" },
  { to: "/", label: "Painel", icon: "📊", end: true },
  { to: "/radar", label: "Radar", icon: "📡" },
  { to: "/reativacao", label: "Reativar", icon: "🔄" },
  { to: "/central-ia", label: "IA", icon: "💬" },
];

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex bg-[#f5f6fb]">
      <aside className="hidden md:flex md:flex-col w-64 shrink-0 border-r border-gray-200 bg-white">
        <div className="px-5 py-5 border-b border-gray-100">
          <div className="text-lg font-bold text-brand-700">Copiloto IA</div>
          <div className="text-xs text-gray-500">Copiloto Gerencial de Vendas</div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? "bg-brand-50 text-brand-700" : "text-gray-600 hover:bg-gray-50"
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-gray-100">
          <div className="text-sm font-medium text-gray-800">{user?.name}</div>
          <div className="text-xs text-gray-500 mb-2">{user?.role}</div>
          <button onClick={logout} className="text-xs text-brand-600 hover:underline">
            Sair
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <div className="font-bold text-brand-700">Copiloto IA</div>
          <button onClick={logout} className="text-xs text-brand-600">
            Sair
          </button>
        </header>

        <main className="flex-1 p-4 md:p-8 pb-20 md:pb-8 max-w-6xl w-full mx-auto">
          <Outlet />
        </main>

        <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 flex justify-around py-2 z-20">
          {MOBILE_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center text-[11px] px-2 py-1 rounded-lg ${
                  isActive ? "text-brand-700" : "text-gray-500"
                }`
              }
            >
              <span className="text-lg leading-none">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
