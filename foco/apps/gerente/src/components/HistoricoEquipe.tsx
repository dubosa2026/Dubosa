import { useEffect, useState } from "react";
import type { Problem } from "../../shared/ipc";

const STATUS_LABEL: Record<Problem["status"], string> = {
  ABERTO: "Aberto",
  EM_ANDAMENTO: "Em andamento",
  RESOLVIDO: "Resolvido",
};

export default function HistoricoEquipe() {
  const [chamados, setChamados] = useState<Problem[] | null>(null);

  useEffect(() => {
    window.focoGer.getHistorico().then((resposta) => {
      if (resposta.ok) setChamados(resposta.data);
    });
  }, []);

  if (!chamados) return <p className="empty-hint">Carregando...</p>;

  return (
    <div className="panel">
      <h3>Histórico de chamados da equipe</h3>
      {chamados.length === 0 && <p className="empty-hint">Nenhum chamado registrado.</p>}
      <ul className="chamados-list">
        {chamados.map((p) => (
          <li key={p.id} className="chamado-item">
            <div className="chamado-topo">
              <span className="chamado-protocolo">{p.protocolo}</span>
              <span className={`chamado-status status-${p.status.toLowerCase()}`}>{STATUS_LABEL[p.status]}</span>
            </div>
            <div className="chamado-cliente">{p.cliente}</div>
            <div className="chamado-descricao">{p.descricao}</div>
            <div className="chamado-meta">
              {p.categoria} · {p.areaResponsavel} · prioridade {p.prioridade}
              {p.preso && <span className="chamado-preso"> · 🆘 vendedor pediu ajuda</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
