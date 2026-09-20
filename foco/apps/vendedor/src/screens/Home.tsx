import { useState } from "react";
import type { HomeData } from "../../shared/ipc";
import { CATEGORIA_COR, CATEGORIA_LABEL, formatDuracao } from "../format";
import RegistrarProblemaModal from "../components/RegistrarProblemaModal";
import RegistrarAcaoIntegradorModal from "../components/RegistrarAcaoIntegradorModal";
import HistoricoChamados from "../components/HistoricoChamados";
import AutonomiaResumo from "../components/AutonomiaResumo";

export default function Home({ initialData, onLogout }: { initialData: HomeData; onLogout: () => void }) {
  const [data, setData] = useState<HomeData>(initialData);
  const [mostrarModalProblema, setMostrarModalProblema] = useState(false);
  const [mostrarModalIntegrador, setMostrarModalIntegrador] = useState(false);
  const [carregandoProspeccao, setCarregandoProspeccao] = useState(false);

  const emProspeccao = data.emAndamento?.categoria === "PROSPECCAO";
  const emProblemaAgora = data.emAndamento?.categoria === "PROBLEMA" ? data.emAndamento : null;
  const problemaAtualAberto = emProblemaAgora
    ? data.historicoChamados.find((p) => p.id === emProblemaAgora.problemaId && p.status !== "RESOLVIDO")
    : null;

  async function refresh() {
    const resposta = await window.foco.getHomeData();
    if (resposta.ok) setData(resposta.data);
  }

  async function toggleProspeccao() {
    setCarregandoProspeccao(true);
    if (emProspeccao) {
      await window.foco.stopTime();
    } else {
      if (data.emAndamento) await window.foco.stopTime();
      await window.foco.startTime("PROSPECCAO");
    }
    await refresh();
    setCarregandoProspeccao(false);
  }

  async function iniciarBloco(categoria: "NEGOCIACAO" | "FOLLOWUP" | "COTACAO_OPERACIONAL" | "OUTROS") {
    if (data.emAndamento) await window.foco.stopTime();
    await window.foco.startTime(categoria);
    await refresh();
  }

  async function handleEstouPreso() {
    if (!problemaAtualAberto) return;
    await window.foco.markStuck(problemaAtualAberto.id);
    await refresh();
  }

  const { focoComercial } = data;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <div className="app-title">FOCO</div>
          <div className="app-subtitle">{data.user.nome}</div>
        </div>
        <button className="btn-link" onClick={onLogout}>
          Sair
        </button>
      </header>

      <section className="foco-card">
        <div className="foco-percent">{focoComercial.focoComercialPercent}%</div>
        <div className="foco-label">
          Índice de Foco Comercial
          <div className="foco-sublabel">tempo em atividades comerciais / tempo total registrado hoje</div>
        </div>
      </section>

      <section className="breakdown">
        {focoComercial.porCategoria
          .filter((c) => c.segundos > 0)
          .map((c) => (
            <div className="breakdown-row" key={c.categoria}>
              <span className="breakdown-dot" style={{ background: CATEGORIA_COR[c.categoria] }} />
              <span className="breakdown-label">{CATEGORIA_LABEL[c.categoria]}</span>
              <span className="breakdown-time">{formatDuracao(c.segundos)}</span>
            </div>
          ))}
        {focoComercial.totalSegundos === 0 && <p className="empty-hint">Nenhum tempo registrado hoje ainda.</p>}
      </section>

      <section className="actions">
        <button
          className={emProspeccao ? "btn-danger btn-big" : "btn-primary btn-big"}
          onClick={toggleProspeccao}
          disabled={carregandoProspeccao}
        >
          {emProspeccao ? "■ PARAR PROSPECÇÃO" : "▶ INICIAR PROSPECÇÃO"}
        </button>

        <div className="actions-row">
          <button className="btn-secondary" onClick={() => iniciarBloco("NEGOCIACAO")}>
            Iniciar Negociação
          </button>
          <button className="btn-secondary" onClick={() => iniciarBloco("FOLLOWUP")}>
            Iniciar Follow-up
          </button>
        </div>

        <div className="actions-row">
          <button className="btn-warning" onClick={() => setMostrarModalProblema(true)}>
            🚨 Registrar Problema
          </button>
          <button className="btn-outline" onClick={() => setMostrarModalIntegrador(true)}>
            📋 Registrar cotação/pedido do integrador
          </button>
        </div>

        {problemaAtualAberto && (
          <button
            className={problemaAtualAberto.preso ? "btn-muted" : "btn-sos"}
            onClick={handleEstouPreso}
            disabled={problemaAtualAberto.preso}
          >
            {problemaAtualAberto.preso ? "🆘 Ajuda já solicitada" : "🆘 Estou preso neste problema"}
          </button>
        )}
      </section>

      <section className="columns">
        <HistoricoChamados chamados={data.historicoChamados} />
        <AutonomiaResumo />
      </section>

      {mostrarModalProblema && (
        <RegistrarProblemaModal
          onClose={() => setMostrarModalProblema(false)}
          onRegistrado={async () => {
            setMostrarModalProblema(false);
            await refresh();
          }}
        />
      )}

      {mostrarModalIntegrador && (
        <RegistrarAcaoIntegradorModal
          onClose={() => setMostrarModalIntegrador(false)}
          onRegistrado={() => setMostrarModalIntegrador(false)}
        />
      )}
    </div>
  );
}
