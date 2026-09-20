import type { DashboardData } from "../../shared/ipc";

export default function PainelIndicadores({ dados }: { dados: DashboardData }) {
  return (
    <div>
      <section className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-value">
            {dados.emProspeccao} / {dados.totalVendedores}
          </div>
          <div className="kpi-label">Equipe em prospecção</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{dados.focoComercialPercentEquipe}%</div>
          <div className="kpi-label">Foco comercial</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{dados.chamadosOperacionaisAbertos}</div>
          <div className="kpi-label">Chamados operacionais</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-value">{dados.tempoOperacionalPercent}%</div>
          <div className="kpi-label">Tempo operacional</div>
        </div>
        <div className="kpi-card kpi-highlight">
          <div className="kpi-value">{dados.horasRecuperaveisMes}h/mês</div>
          <div className="kpi-label">Tempo potencialmente recuperável</div>
        </div>
      </section>

      <section className="panel">
        <h3>Alertas</h3>
        {dados.alertas.length === 0 && <p className="empty-hint">Nenhum alerta no momento.</p>}
        <ul className="alertas-list">
          {dados.alertas.map((a, i) => (
            <li key={i} className={a.tipo === "ALERTA" ? "alerta-item alerta-warn" : "alerta-item alerta-oportunidade"}>
              {a.tipo === "ALERTA" ? "⚠️ " : "💡 "}
              {a.texto}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
