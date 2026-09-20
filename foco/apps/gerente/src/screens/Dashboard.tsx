import { useState } from "react";
import type { PainelData } from "../../shared/ipc";
import Painel from "../components/Painel";
import Equipe from "../components/Equipe";
import VisaoIndividual from "../components/VisaoIndividual";
import ConfigAlertasModal from "../components/ConfigAlertasModal";

type Aba = "PAINEL" | "EQUIPE";

const PERIODOS = [
  { dias: 1, label: "Hoje" },
  { dias: 7, label: "7 dias" },
  { dias: 30, label: "30 dias" },
];

export default function Dashboard({
  initialData,
  onLogout,
}: {
  initialData: PainelData;
  onLogout: () => void;
}) {
  const [dados, setDados] = useState<PainelData>(initialData);
  const [aba, setAba] = useState<Aba>("PAINEL");
  const [vendedorAberto, setVendedorAberto] = useState<string | null>(null);
  const [configAberta, setConfigAberta] = useState(false);

  async function recarregar(dias?: number) {
    const r = await window.focoGer.getPainel(dias);
    if (r.ok) setDados(r.data);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <div className="app-title">FOCO</div>
          <div className="app-subtitle">Painel gerencial · {dados.gerente.nome}</div>
        </div>
        <div className="header-acoes">
          <div className="periodo">
            {PERIODOS.map((p) => (
              <button
                key={p.dias}
                className={dados.dias === p.dias ? "periodo-ativo" : ""}
                onClick={() => recarregar(p.dias)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button className="btn-link" onClick={() => setConfigAberta(true)}>Alertas</button>
          <button className="btn-link" onClick={onLogout}>Sair</button>
        </div>
      </header>

      {vendedorAberto ? (
        <VisaoIndividual userId={vendedorAberto} onVoltar={() => setVendedorAberto(null)} />
      ) : (
        <>
          <nav className="abas">
            <button className={aba === "PAINEL" ? "aba-ativa" : ""} onClick={() => setAba("PAINEL")}>
              Painel
            </button>
            <button className={aba === "EQUIPE" ? "aba-ativa" : ""} onClick={() => setAba("EQUIPE")}>
              Equipe
            </button>
          </nav>

          {aba === "PAINEL" && <Painel dados={dados} />}
          {aba === "EQUIPE" && <Equipe dados={dados} onAbrirVendedor={setVendedorAberto} />}
        </>
      )}

      <p className="rodape">
        O FOCO mede atividades do processo comercial dentro do próprio aplicativo — nunca o que o
        vendedor faz no computador. A pergunta do painel é o que está impedindo cada pessoa de
        dedicar mais tempo ao trabalho que deveria estar fazendo.
      </p>

      {configAberta && (
        <ConfigAlertasModal
          config={dados.config}
          onFechar={() => setConfigAberta(false)}
          onSalvo={async () => {
            setConfigAberta(false);
            await recarregar();
          }}
        />
      )}
    </div>
  );
}
