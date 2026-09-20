import { useState } from "react";
import type { DashboardData } from "../../shared/ipc";
import PainelIndicadores from "../components/PainelIndicadores";
import Equipe from "../components/Equipe";
import MapaConsumo from "../components/MapaConsumo";
import AutonomiaEquipe from "../components/AutonomiaEquipe";
import HistoricoEquipe from "../components/HistoricoEquipe";

type Aba = "PAINEL" | "EQUIPE" | "MAPA" | "AUTONOMIA" | "HISTORICO";

const ABAS: Array<{ id: Aba; label: string }> = [
  { id: "PAINEL", label: "Painel" },
  { id: "EQUIPE", label: "Equipe" },
  { id: "MAPA", label: "Mapa de consumo" },
  { id: "AUTONOMIA", label: "Autonomia" },
  { id: "HISTORICO", label: "Histórico" },
];

export default function Dashboard({ initialData, onLogout }: { initialData: DashboardData; onLogout: () => void }) {
  const [dados, setDados] = useState<DashboardData>(initialData);
  const [aba, setAba] = useState<Aba>("PAINEL");

  async function refresh() {
    const resposta = await window.focoGer.getDashboard();
    if (resposta.ok) setDados(resposta.data);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <div className="app-title">FOCO Gerenciador</div>
          <div className="app-subtitle">{dados.gerente.nome}</div>
        </div>
        <button className="btn-link" onClick={onLogout}>
          Sair
        </button>
      </header>

      <nav className="tabs">
        {ABAS.map((a) => (
          <button
            key={a.id}
            className={aba === a.id ? "tab-active" : "tab"}
            onClick={() => {
              setAba(a.id);
              if (a.id === "PAINEL") refresh();
            }}
          >
            {a.label}
          </button>
        ))}
      </nav>

      {aba === "PAINEL" && <PainelIndicadores dados={dados} />}
      {aba === "EQUIPE" && <Equipe />}
      {aba === "MAPA" && <MapaConsumo />}
      {aba === "AUTONOMIA" && <AutonomiaEquipe />}
      {aba === "HISTORICO" && <HistoricoEquipe />}
    </div>
  );
}
